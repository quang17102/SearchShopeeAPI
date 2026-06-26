const fs = require("fs");
const { LOG_FILE } = require("../config/paths");

function writeLog(msg) {
    const time = new Date().toLocaleTimeString("vi-VN");
    const logLine = `[${time}] ${msg}`;
    console.log(logLine);
    try {
        fs.appendFileSync(LOG_FILE, `\n${logLine}`);
    } catch (_) {}
}

module.exports = { writeLog };
