import axios from "axios";
import dotenv from "dotenv";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const logsDir = path.join(__dirname, "../logs");
const tokenFile = path.join(__dirname, "../.token");

// Create logs directory if it doesn't exist
if (!fs.existsSync(logsDir)) {
  fs.mkdirSync(logsDir, { recursive: true });
}

const LOGIN_URL = "https://api.synccode.dev/auth/login";
const LOGIN_EMAIL = process.env.LOGIN_EMAIL;
const LOGIN_PASSWORD = process.env.LOGIN_PASSWORD;

function writeLog(message) {
  const timestamp = new Date().toISOString();
  const logMessage = `[${timestamp}] ${message}`;
  console.log(logMessage);

  // Append to log file
  const logFile = path.join(logsDir, `login-${new Date().toISOString().split("T")[0]}.log`);
  fs.appendFileSync(logFile, logMessage + "\n");
}

function saveToken(token) {
  fs.writeFileSync(tokenFile, token);
  writeLog(`✓ Token saved to ${tokenFile}`);
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

async function login() {
  try {
    writeLog("Attempting to login...");

    if (!LOGIN_EMAIL || !LOGIN_PASSWORD) {
      throw new Error("LOGIN_EMAIL or LOGIN_PASSWORD not found in .env");
    }

    const response = await axios.post(
      LOGIN_URL,
      {
        email: LOGIN_EMAIL,
        password: LOGIN_PASSWORD,
      },
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

    if (!token) {
      throw new Error("No token returned from API");
    }

    saveToken(token);
    writeLog("====================================");
    writeLog("✓ Login successful!");
    writeLog("Token: " + token.substring(0, 20) + "...");
    writeLog("====================================");

    return token;
  } catch (error) {
    writeLog("❌ LOGIN ERROR");

    if (error.response) {
      writeLog("Status: " + error.response.status);
      writeLog("Data: " + JSON.stringify(error.response.data));
    } else {
      writeLog("Error: " + error.message);
    }

    writeLog("====================================");
    throw error;
  }
}

// Run login on script start
export async function getValidToken() {
  try {
    const existingToken = getToken();

    if (existingToken) {
      writeLog("Using existing token");
      return existingToken;
    }

    return await login();
  } catch (error) {
    writeLog("Failed to get valid token");
    throw error;
  }
}

// If run directly
if (import.meta.url === `file://${process.argv[1]}`) {
  login().catch((error) => {
    process.exit(1);
  });
}

export default login;
