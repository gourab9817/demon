import axios from "axios";
import dotenv from "dotenv";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { getValidToken } from "./login.js";

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const logsDir = path.join(__dirname, "../logs");
const tokenFile = path.join(__dirname, "../.token");

// Create logs directory if it doesn't exist
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

async function runOrchestrator() {
  try {
    let token = getToken();

    if (!token) {
      writeLog("No token found, attempting to login...");
      token = await getValidToken();
    }

    writeLog("====================================");
    writeLog("Starting Orchestrator - Running all services...");
    writeLog("====================================");

    const startTime = Date.now();

    // 1. Forgot Password Service
    const forgotPasswordPromise = axios
      .post(
        "https://api.synccode.dev/auth/forgot-password",
        { email: process.env.TEST_EMAIL },
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

    // 2. Keep-Alive (Execute)
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

    // 3. Room Creation
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

    // 4. Load Test (batched, configurable to avoid OOM)
    const PARALLEL_REQUESTS = parseInt(process.env.PARALLEL_REQUESTS || "50", 10);
    const BATCH_SIZE = parseInt(process.env.BATCH_SIZE || "25", 10);

    const loadTestPromise = (async () => {
      try {
        let executeSuccess = 0;
        let roomSuccess = 0;
        let executeFailures = 0;
        let roomFailures = 0;

        writeLog(`Starting load test: ${PARALLEL_REQUESTS * 2} requests (batched ${BATCH_SIZE})`);

        for (let offset = 0; offset < PARALLEL_REQUESTS; offset += BATCH_SIZE) {
          const batch = Math.min(BATCH_SIZE, PARALLEL_REQUESTS - offset);
          const execPromises = [];
          const roomPromises = [];

          for (let i = 0; i < batch; i++) {
            const id = offset + i;
            execPromises.push(
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

            roomPromises.push(
              axios.post(
                "https://api.synccode.dev/rooms/create",
                { language: "javascript", name: `loadtest-${id}` },
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

          const [execResults, roomResults] = await Promise.all([
            Promise.allSettled(execPromises),
            Promise.allSettled(roomPromises),
          ]);

          execResults.forEach((r) => (r.status === "fulfilled" ? executeSuccess++ : executeFailures++));
          roomResults.forEach((r) => (r.status === "fulfilled" ? roomSuccess++ : roomFailures++));
        }

        writeLog(`✓ Load test: Execute ${executeSuccess}/${PARALLEL_REQUESTS}, Room ${roomSuccess}/${PARALLEL_REQUESTS}`);
        return { service: "load-test", success: true, stats: { executeSuccess, roomSuccess } };
      } catch (error) {
        writeLog("❌ Load test error: " + error.message);
        return { service: "load-test", success: false };
      }
    })();

    // Wait for all services
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
    writeLog("RESULTS: " + JSON.stringify(results, null, 2));
    writeLog("====================================");
  } catch (error) {
    writeLog("Orchestrator error: " + error.message);
  }
}

async function start() {
  writeLog("====================================");
  writeLog("Orchestrator Started");
  writeLog("Running all services every 1 second");
  writeLog("====================================");

  try {
    await getValidToken();
  } catch (error) {
    writeLog("Failed to login on startup");
    process.exit(1);
  }

  await runOrchestrator();
  setInterval(runOrchestrator, 1000);
}

start();
