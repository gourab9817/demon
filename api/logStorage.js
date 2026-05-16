// Shared log storage
let logBuffer = [];
const MAX_LOGS = 1000;

export function addLog(message) {
  const timestamp = new Date().toISOString();
  const logEntry = {
    timestamp,
    message,
    id: Date.now() + Math.random(),
  };
  
  logBuffer.push(logEntry);
  
  // Keep only last 1000 logs
  if (logBuffer.length > MAX_LOGS) {
    logBuffer.shift();
  }
  
  return logEntry;
}

export function getLogs() {
  return logBuffer;
}

export function clearLogs() {
  logBuffer = [];
}
