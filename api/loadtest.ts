import axios from "axios";
import fs from "fs";
import path from "path";

const tokenFile = "/tmp/.synccode-token";
const logsDir = "/tmp/synccode-logs";
const PARALLEL_REQUESTS = 2000;

// Create logs directory
if (!fs.existsSync(logsDir)) {
  fs.mkdirSync(logsDir, { recursive: true });
}

function writeLog(message) {
  const timestamp = new Date().toISOString();
  const logMessage = `[${timestamp}] ${message}`;
  console.log(logMessage);
  const logFile = path.join(logsDir, `loadtest-${new Date().toISOString().split("T")[0]}.log`);
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
    writeLog("Attempting login for load test...");
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

async function executeRequest(token, requestId) {
  try {
    const response = await axios.post(
      "https://api.synccode.dev/execute",
      {
        code: "console.log('Load test');",
        language: "javascript",
      },
      {
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
          Origin: "https://www.synccode.dev",
          Referer: "https://www.synccode.dev/",
        },
        timeout: 5000,
      }
    );
    return { success: true, requestId, type: "execute" };
  } catch (error) {
    return { success: false, requestId, type: "execute", error: error.message };
  }
}

async function roomRequest(token, requestId) {
  try {
    const response = await axios.post(
      "https://api.synccode.dev/rooms/create",
      {
        language: "javascript",
        name: `loadtest-${requestId}`,
      },
      {
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
          Origin: "https://www.synccode.dev",
          Referer: "https://www.synccode.dev/",
        },
        timeout: 5000,
      }
    );
    return { success: true, requestId, type: "room" };
  } catch (error) {
    return { success: false, requestId, type: "room", error: error.message };
  }
}

export default async function handler(req, res) {
  try {
    const email = process.env.LOGIN_EMAIL;
    const password = process.env.LOGIN_PASSWORD;

    if (!email || !password) {
      return res.status(400).json({ error: "Missing LOGIN_EMAIL or LOGIN_PASSWORD" });
    }

    let token = getToken();

    if (!token) {
      token = await login(email, password);
    }

    writeLog(`Starting load test with ${PARALLEL_REQUESTS * 2} parallel requests...`);

    const startTime = Date.now();

    // Create arrays of promises
    const executePromises = [];
    const roomPromises = [];

    for (let i = 0; i < PARALLEL_REQUESTS; i++) {
      executePromises.push(executeRequest(token, i));
      roomPromises.push(roomRequest(token, i));
    }

    // Execute all requests in parallel
    const [executeResults, roomResults] = await Promise.all([
      Promise.all(executePromises),
      Promise.all(roomPromises),
    ]);

    const duration = Date.now() - startTime;

    // Calculate statistics
    const executeSuccess = executeResults.filter((r) => r.success).length;
    const roomSuccess = roomResults.filter((r) => r.success).length;

    writeLog(
      `Load Test Complete: Execute ${executeSuccess}/${PARALLEL_REQUESTS}, Room ${roomSuccess}/${PARALLEL_REQUESTS}, Duration: ${duration}ms`
    );

    res.status(200).json({
      success: true,
      loadtest: {
        executeSuccess,
        roomSuccess,
        duration,
        requestsPerSecond: ((PARALLEL_REQUESTS * 2) / (duration / 1000)).toFixed(0),
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
