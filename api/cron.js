import axios from "axios";
import dotenv from "dotenv";

dotenv.config();

const API_URL = "https://api.synccode.dev/auth/forgot-password";

const payload = {
  email: process.env.TEST_EMAIL,
};

async function hitApi() {
  try {
    const response = await axios.post(API_URL, payload, {
      headers: {
        "Content-Type": "application/json",
        Origin: "https://www.synccode.dev",
        Referer: "https://www.synccode.dev/",
      },
      timeout: 10000,
    });

    console.log("====================================");
    console.log("Time:", new Date().toISOString());
    console.log("Status:", response.status);
    console.log("Response:", response.data);
    console.log("====================================");
  } catch (error) {
    console.error("API ERROR");
    console.error("Time:", new Date().toISOString());

    if (error.response) {
      console.error("Status:", error.response.status);
      console.error("Data:", error.response.data);
    } else {
      console.error(error.message);
    }
  }
}

hitApi();

setInterval(hitApi, 65000);