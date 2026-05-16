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

function saveToken(token) {
  fs.writeFileSync(tokenFile, token);
}

async function login(email, password) {
  try {
    writeLog("Attempting login...");
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

async function executeCode(token) {
  try {
    const response = await axios.post(
      "https://api.synccode.dev/execute",
      {
        code: "console.log('Keep-alive: Vercel endpoint is alive!');",
        language: "javascript",
      },
      {
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
          Origin: "https://www.synccode.dev",
          Referer: "https://www.synccode.dev/",
        },
        timeout: 10000,
      }
    );

    writeLog("✓ Code executed");
    return true;
  } catch (error) {
    if (error.response?.status === 401) {
      writeLog("⚠ Token expired");
      return false;
    }
    writeLog("❌ Execution error: " + error.message);
    return false;
  }
}

async function createRoom(token) {
  try {
    const response = await axios.post(
      "https://api.synccode.dev/rooms/create",
      {
        language: "javascript",
        name: "qq",
      },
      {
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
          Origin: "https://www.synccode.dev",
          Referer: "https://www.synccode.dev/",
        },
        timeout: 10000,
      }
    );

    writeLog("✓ Room created: " + response.data.id);
    return true;
  } catch (error) {
    if (error.response?.status === 401) {
      writeLog("⚠ Token expired during room creation");
      return false;
    }
    writeLog("❌ Room creation error: " + error.message);
    return false;
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

    const executeSuccess = await executeCode(token);
    const roomSuccess = await createRoom(token);

    if (!executeSuccess || !roomSuccess) {
      // Token expired, get new one
      token = await login(email, password);
      await executeCode(token);
      await createRoom(token);
    }

    res.status(200).json({
      success: true,
      message: "Keep-alive executed successfully",
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    writeLog("Handler error: " + error.message);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
}
