import axios from "axios";
import dotenv from "dotenv";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const logsDir = path.join(__dirname, "../logs");

// Create logs directory if it doesn't exist
if (!fs.existsSync(logsDir)) {
  fs.mkdirSync(logsDir, { recursive: true });
}

const API_URL = "https://api.synccode.dev/execute";
const JWT_TOKEN = process.env.JWT_TOKEN;

const payload = {
  code: "console.log('Hello, World!');",
  language: "javascript",
};

function writeLog(message) {
  const timestamp = new Date().toISOString();
  const logMessage = `[${timestamp}] ${message}`;
  console.log(logMessage);

  // Append to log file
  const logFile = path.join(logsDir, `execute-${new Date().toISOString().split("T")[0]}.log`);
  fs.appendFileSync(logFile, logMessage + "\n");
}

async function executeCode() {
  try {
    writeLog("Starting code execution request...");

    if (!JWT_TOKEN) {
      throw new Error("JWT_TOKEN not found in environment variables");
    }

    const response = await axios.post(API_URL, payload, {
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${JWT_TOKEN}`,
        Origin: "https://www.synccode.dev",
        Referer: "https://www.synccode.dev/",
      },
      timeout: 10000,
    });

    writeLog("====================================");
    writeLog("Status: " + response.status);
    writeLog("Response: " + JSON.stringify(response.data));
    writeLog("====================================");
    writeLog("✓ Code execution successful!");
  } catch (error) {
    writeLog("❌ EXECUTION ERROR");

    if (error.response) {
      writeLog("Status: " + error.response.status);
      writeLog("Data: " + JSON.stringify(error.response.data));
    } else if (error.message) {
      writeLog("Error: " + error.message);
    } else {
      writeLog("Unknown error occurred");
    }

    writeLog("====================================");
  }
}

executeCode();

// Run every 2 minutes
setInterval(executeCode, 120000);
