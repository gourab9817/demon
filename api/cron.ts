import axios from "axios";

export default async function handler(req, res) {
  try {
    const response = await axios.post(
      "https://api.synccode.dev/auth/forgot-password",
      {
        email: process.env.TEST_EMAIL,
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

    console.log("====================================");
    console.log("Time:", new Date().toISOString());
    console.log("Status:", response.status);
    console.log("Response:", response.data);
    console.log("====================================");

    res.status(200).json({
      success: true,
      message: "Cron job executed successfully",
      data: response.data,
    });
  } catch (error) {
    console.error("API ERROR");
    console.error("Time:", new Date().toISOString());

    if (error.response) {
      console.error("Status:", error.response.status);
      console.error("Data:", error.response.data);
      return res.status(error.response.status).json({
        success: false,
        error: error.response.data,
      });
    } else {
      console.error(error.message);
      return res.status(500).json({
        success: false,
        error: error.message,
      });
    }
  }
}
