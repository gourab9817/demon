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

const EXECUTE_URL = "https://api.synccode.dev/execute";
const CREATE_ROOM_URL = "https://api.synccode.dev/rooms/create";
const PARALLEL_REQUESTS = parseInt(process.env.PARALLEL_REQUESTS || "50", 10);
const BATCH_SIZE = parseInt(process.env.BATCH_SIZE || "25", 10);

function writeLog(message) {
  const timestamp = new Date().toISOString();
  const logMessage = `[${timestamp}] ${message}`;
  console.log(logMessage);

  // Append to log file
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

async function executeCodeRequest(token, requestId) {
  try {
    const payload = {
      code: "console.log('Load test execution');",
      language: "javascript",
    };

    const response = await axios.post(EXECUTE_URL, payload, {
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
        Origin: "https://www.synccode.dev",
        Referer: "https://www.synccode.dev/",
      },
      timeout: 5000,
    });

    return {
      success: true,
      requestId,
      status: response.status,
      type: "execute",
    };
  } catch (error) {
    return {
      success: false,
      requestId,
      error: error.message,
      type: "execute",
    };
  }
}

async function createRoomRequest(token, requestId) {
  try {
    const payload = {
      language: "javascript",
      name: `loadtest-${requestId}`,
    };

    const response = await axios.post(CREATE_ROOM_URL, payload, {
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
        Origin: "https://www.synccode.dev",
        Referer: "https://www.synccode.dev/",
      },
      timeout: 5000,
    });

    return {
      success: true,
      requestId,
      status: response.status,
      type: "room",
    };
  } catch (error) {
    return {
      success: false,
      requestId,
      error: error.message,
      type: "room",
    };
  }
}

async function runLoadTest() {
  try {
    let token = getToken();

    if (!token) {
      writeLog("No token found, attempting to login...");
      token = await getValidToken();
    }

    writeLog("====================================");
    writeLog(`Starting load test with ${PARALLEL_REQUESTS * 2} requests (batched)`);
    writeLog(`Batch size: ${BATCH_SIZE}`);
    writeLog("====================================");

    const startTime = Date.now();

    // Execute in batches to limit concurrent promises
    let executeSuccess = 0;
    let roomSuccess = 0;
    let executeFailures = 0;
    let roomFailures = 0;

    for (let offset = 0; offset < PARALLEL_REQUESTS; offset += BATCH_SIZE) {
      const batch = Math.min(BATCH_SIZE, PARALLEL_REQUESTS - offset);

      const execPromises = [];
      const roomPromises = [];

      for (let i = 0; i < batch; i++) {
        const id = offset + i;
        execPromises.push(executeCodeRequest(token, id));
        roomPromises.push(createRoomRequest(token, id));
      }

      const [execResults, roomResults] = await Promise.all([
        Promise.all(execPromises),
        Promise.all(roomPromises),
      ]);

      execResults.forEach((r) => (r.success ? executeSuccess++ : executeFailures++));
      roomResults.forEach((r) => (r.success ? roomSuccess++ : roomFailures++));
    }

    const duration = Date.now() - startTime;

    writeLog("====================================");
    writeLog(`Load Test Completed in ${duration}ms`);
    writeLog(`Execute Requests: ${executeSuccess}/${PARALLEL_REQUESTS} successful`);
    writeLog(`Room Requests: ${roomSuccess}/${PARALLEL_REQUESTS} successful`);
    writeLog(`Total Failures: ${executeFailures + roomFailures}`);
    writeLog(`Approx Requests per second: ${((PARALLEL_REQUESTS * 2) / (duration / 1000)).toFixed(0)}`);
    writeLog("====================================");
  } catch (error) {
    if (error.response && error.response.status === 401) {
      writeLog("⚠ Token expired, logging in again...");
      try {
        const { getValidToken: refresh } = await import("./login.js");
        await refresh();
      } catch (loginError) {
        writeLog("Failed to refresh token: " + loginError.message);
      }
    } else {
      writeLog("❌ Load Test Error: " + error.message);
    }
  }
}

async function startLoadTest() {
  writeLog("====================================");
  writeLog("Load Testing Service Started");
  writeLog(`Will send ${PARALLEL_REQUESTS * 2} parallel requests every 1 second`);
  writeLog("====================================");

  // Initial login
  try {
    await getValidToken();
  } catch (error) {
    writeLog("Failed to login on startup");
    process.exit(1);
  }

  // Run immediately, then every 1 second
  await runLoadTest();
  setInterval(runLoadTest, 1000);
}

startLoadTest();
