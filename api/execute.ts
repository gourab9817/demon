import axios from "axios";
import fs from "fs";
import path from "path";

const logsDir = "/tmp/synccode-logs";

// Create logs directory if it doesn't exist
if (!fs.existsSync(logsDir)) {
  fs.mkdirSync(logsDir, { recursive: true });
}

function writeLog(message) {
  const timestamp = new Date().toISOString();
  const logMessage = `[${timestamp}] ${message}`;
  console.log(logMessage);

  // Write to log file in /tmp
  const logFile = path.join(logsDir, `execute-${new Date().toISOString().split("T")[0]}.log`);
  fs.appendFileSync(logFile, logMessage + "\n");
}

export default async function handler(req, res) {
  try {
    writeLog("Starting code execution request...");

    const JWT_TOKEN = process.env.JWT_TOKEN;
    if (!JWT_TOKEN) {
      throw new Error("JWT_TOKEN not found in environment variables");
    }

    const payload = {
      code: "console.log('Hello, World!');",
      language: "javascript",
    };

    const response = await axios.post(
      "https://api.synccode.dev/execute",
      payload,
      {
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${JWT_TOKEN}`,
          Origin: "https://www.synccode.dev",
          Referer: "https://www.synccode.dev/",
        },
        timeout: 10000,
      }
    );

    writeLog("====================================");
    writeLog("Status: " + response.status);
    writeLog("Response: " + JSON.stringify(response.data));
    writeLog("====================================");
    writeLog("✓ Code execution successful!");

    res.status(200).json({
      success: true,
      message: "Code executed successfully",
      data: response.data,
    });
  } catch (error) {
    writeLog("❌ EXECUTION ERROR");

    if (error.response) {
      writeLog("Status: " + error.response.status);
      writeLog("Data: " + JSON.stringify(error.response.data));
      return res.status(error.response.status).json({
        success: false,
        error: error.response.data,
      });
    } else {
      writeLog("Error: " + error.message);
      return res.status(500).json({
        success: false,
        error: error.message,
      });
    }
  }
}
