import axios from "axios";
import fs from "fs";
import path from "path";

const tokenFile = "/tmp/.synccode-token";
const logsDir = "/tmp/synccode-logs";

// Create logs directory
if (!fs.existsSync(logsDir)) {
  fs.mkdirSync(logsDir, { recursive: true });
}

function writeLog(message) {
  const timestamp = new Date().toISOString();
  const logMessage = `[${timestamp}] ${message}`;
  console.log(logMessage);
  const logFile = path.join(logsDir, `orchestrator-${new Date().toISOString().split("T")[0]}.log`);
  fs.appendFileSync(logFile, logMessage + "\n");
}

function getToken() {
  try {
    if (fs.existsSync(tokenFile)) {
      return fs.readFileSync(tokenFile, "utf-8").trim();
    }
  } catch (error) {
    writeLog(`Error reading token: ${error.message}`);
  }
  return null;
}

function saveToken(token) {
  fs.writeFileSync(tokenFile, token);
}

async function login(email, password) {
  try {
    const response = await axios.post(
      "https://api.synccode.dev/auth/login",
      { email, password },
      {
        headers: {
          "Content-Type": "application/json",
          Origin: "https://www.synccode.dev",
          Referer: "https://www.synccode.dev/",
        },
        timeout: 10000,
      }
    );

    const token = response.data.token;
    saveToken(token);
    writeLog("✓ Login successful!");
    return token;
  } catch (error) {
    writeLog("❌ Login failed: " + (error.response?.data?.message || error.message));
    throw error;
  }
}

export default async function handler(req, res) {
  try {
    const email = process.env.LOGIN_EMAIL;
    const password = process.env.LOGIN_PASSWORD;
    const testEmail = process.env.TEST_EMAIL;

    if (!email || !password) {
      return res.status(400).json({ error: "Missing LOGIN_EMAIL or LOGIN_PASSWORD" });
    }

    let token = getToken();
    if (!token) {
      token = await login(email, password);
    }

    writeLog("====================================");
    writeLog("Starting Orchestrator - Running all services...");
    writeLog("====================================");

    const startTime = Date.now();

    // 1. Forgot Password Email Service
    const forgotPasswordPromise = axios
      .post(
        "https://api.synccode.dev/auth/forgot-password",
        { email: testEmail },
        {
          headers: {
            "Content-Type": "application/json",
            Origin: "https://www.synccode.dev",
            Referer: "https://www.synccode.dev/",
          },
          timeout: 10000,
        }
      )
      .then((response) => {
        writeLog("✓ Forgot-password response: " + JSON.stringify(response.data));
        return { service: "forgot-password", success: true, response: response.data };
      })
      .catch((error) => {
        writeLog("❌ Forgot-password error: " + JSON.stringify(error.response?.data || error.message));
        return { service: "forgot-password", success: false };
      });

    // 2. Keep-Alive Service (Execute)
    const keepAlivePromise = axios
      .post(
        "https://api.synccode.dev/execute",
        { code: "console.log('Keep-alive');", language: "javascript" },
        {
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
            Origin: "https://www.synccode.dev",
            Referer: "https://www.synccode.dev/",
          },
          timeout: 10000,
        }
      )
      .then((response) => {
        writeLog("✓ Keep-alive response: " + JSON.stringify(response.data));
        return { service: "keepalive", success: true, response: response.data };
      })
      .catch((error) => {
        writeLog("❌ Keep-alive error: " + JSON.stringify(error.response?.data || error.message));
        return { service: "keepalive", success: false };
      });

    // 3. Room Creation Service
    const roomCreationPromise = axios
      .post(
        "https://api.synccode.dev/rooms/create",
        { language: "javascript", name: "orchestrator-room" },
        {
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
            Origin: "https://www.synccode.dev",
            Referer: "https://www.synccode.dev/",
          },
          timeout: 10000,
        }
      )
      .then((response) => {
        writeLog("✓ Room creation response: " + JSON.stringify(response.data));
        return { service: "room-creation", success: true, response: response.data };
      })
      .catch((error) => {
        writeLog("❌ Room creation error: " + JSON.stringify(error.response?.data || error.message));
        return { service: "room-creation", success: false };
      });

    // 4. Load Test Service (2000 parallel requests)
    const loadTestPromise = (async () => {
      try {
        const executeRequests = [];
        const roomRequests = [];

        for (let i = 0; i < 2000; i++) {
          executeRequests.push(
            axios.post(
              "https://api.synccode.dev/execute",
              { code: "console.log('Load test');", language: "javascript" },
              {
                headers: {
                  "Content-Type": "application/json",
                  Authorization: `Bearer ${token}`,
                  Origin: "https://www.synccode.dev",
                  Referer: "https://www.synccode.dev/",
                },
                timeout: 5000,
              }
            )
          );

          roomRequests.push(
            axios.post(
              "https://api.synccode.dev/rooms/create",
              { language: "javascript", name: `loadtest-${i}` },
              {
                headers: {
                  "Content-Type": "application/json",
                  Authorization: `Bearer ${token}`,
                  Origin: "https://www.synccode.dev",
                  Referer: "https://www.synccode.dev/",
                },
                timeout: 5000,
              }
            )
          );
        }

        const [executeResults, roomResults] = await Promise.all([
          Promise.allSettled(executeRequests),
          Promise.allSettled(roomRequests),
        ]);

        const executeSuccess = executeResults.filter((r) => r.status === "fulfilled").length;
        const roomSuccess = roomResults.filter((r) => r.status === "fulfilled").length;

        writeLog(
          `✓ Load test completed: Execute ${executeSuccess}/2000, Room ${roomSuccess}/2000`
        );
        return { service: "load-test", success: true, stats: { executeSuccess, roomSuccess } };
      } catch (error) {
        writeLog("❌ Load test error: " + error.message);
        return { service: "load-test", success: false };
      }
    })();

    // Wait for all services to complete
    const results = await Promise.all([
      forgotPasswordPromise,
      keepAlivePromise,
      roomCreationPromise,
      loadTestPromise,
    ]);

    const duration = Date.now() - startTime;
    const successCount = results.filter((r) => r.success).length;

    writeLog("====================================");
    writeLog(`Orchestrator Complete - ${successCount}/${results.length} services successful`);
    writeLog(`Total duration: ${duration}ms`);
    writeLog("Results Summary: " + JSON.stringify(results));
    writeLog("====================================");

    res.status(200).json({
      success: true,
      orchestrator: {
        totalServices: results.length,
        successful: successCount,
        duration,
        services: results,
      },
    });
  } catch (error) {
    writeLog("Handler error: " + error.message);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
}
