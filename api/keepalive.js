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

function writeLog(message) {
  const timestamp = new Date().toISOString();
  const logMessage = `[${timestamp}] ${message}`;
  console.log(logMessage);

  // Append to log file
  const logFile = path.join(logsDir, `keepalive-${new Date().toISOString().split("T")[0]}.log`);
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

async function executeCode() {
  try {
    let token = getToken();

    if (!token) {
      writeLog("No token found, attempting to login...");
      token = await getValidToken();
    }

    const payload = {
      code: "console.log('Keep-alive: Project is running!');",
      language: "javascript",
    };

    const response = await axios.post(EXECUTE_URL, payload, {
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
        Origin: "https://www.synccode.dev",
        Referer: "https://www.synccode.dev/",
      },
      timeout: 10000,
    });

    writeLog("✓ Code executed successfully");
    writeLog("Status: " + response.status);
  } catch (error) {
    if (error.response && error.response.status === 401) {
      writeLog("⚠ Token expired, logging in again...");
      try {
        const { getValidToken: refresh } = await import("./login.js");
        await refresh();
      } catch (loginError) {
        writeLog("Failed to refresh token: " + loginError.message);
      }
    } else if (error.response) {
      writeLog("❌ Execute Error: " + error.response.status + " - " + JSON.stringify(error.response.data));
    } else {
      writeLog("❌ Execute Error: " + error.message);
    }
  }
}

async function createRoom() {
  try {
    let token = getToken();

    if (!token) {
      writeLog("No token found for room creation, attempting to login...");
      token = await getValidToken();
    }

    const payload = {
      language: "javascript",
      name: "qq",
    };

    const response = await axios.post(CREATE_ROOM_URL, payload, {
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
        Origin: "https://www.synccode.dev",
        Referer: "https://www.synccode.dev/",
      },
      timeout: 10000,
    });

    writeLog("✓ Room created successfully");
    writeLog("Status: " + response.status);
    writeLog("Room ID: " + response.data.id);
  } catch (error) {
    if (error.response && error.response.status === 401) {
      writeLog("⚠ Token expired during room creation, logging in again...");
      try {
        const { getValidToken: refresh } = await import("./login.js");
        await refresh();
      } catch (loginError) {
        writeLog("Failed to refresh token: " + loginError.message);
      }
    } else if (error.response) {
      writeLog("❌ Room Creation Error: " + error.response.status + " - " + JSON.stringify(error.response.data));
    } else {
      writeLog("❌ Room Creation Error: " + error.message);
    }
  }
}

async function startKeepAlive() {
  writeLog("====================================");
  writeLog("Starting keep-alive service...");
  writeLog("Executing code every 1 second");
  writeLog("Creating room every 1 second");
  writeLog("====================================");

  // Initial login
  try {
    await getValidToken();
  } catch (error) {
    writeLog("Failed to login on startup");
    process.exit(1);
  }

  // Run immediately, then every 1 second
  await executeCode();
  await createRoom();
  setInterval(async () => {
    await executeCode();
    await createRoom();
  }, 1000);
}

startKeepAlive();
