const fs = require("fs");
const { writeLog } = require("../infra/logger");
const { QR_FILE, ZALO_SESSION_FILE } = require("../config/paths");
const { ZALO_LANGUAGE } = require("../config/constants");

function loadZaloSession() {
    try {
        if (!fs.existsSync(ZALO_SESSION_FILE)) return null;
        const raw = fs.readFileSync(ZALO_SESSION_FILE, "utf8").trim();
        if (!raw) return null;
        const data = JSON.parse(raw);
        const cookie = data && data.cookie;
        const imei = data && data.imei != null ? String(data.imei).trim() : "";
        const userAgent = data && data.userAgent != null ? String(data.userAgent).trim() : "";
        if (!Array.isArray(cookie) || !cookie.length || !imei || !userAgent) {
            return null;
        }
        return {
            cookie,
            imei,
            userAgent,
            language: data.language != null ? String(data.language) : ZALO_LANGUAGE,
        };
    } catch (e) {
        writeLog(`[WARN] Doc zalo_session.json: ${e.message}`);
        return null;
    }
}

function saveZaloSession(credentials) {
    const cookie = credentials && credentials.cookie;
    const imei = credentials && credentials.imei != null ? String(credentials.imei).trim() : "";
    const userAgent = credentials && credentials.userAgent != null ? String(credentials.userAgent).trim() : "";
    if (!Array.isArray(cookie) || !cookie.length || !imei || !userAgent) {
        writeLog("[WARN] Khong luu phien Zalo: thieu cookie/imei/userAgent");
        return;
    }
    const payload = {
        cookie,
        imei,
        userAgent,
        language: credentials.language != null ? String(credentials.language) : ZALO_LANGUAGE,
        savedAt: new Date().toISOString(),
    };
    fs.writeFileSync(ZALO_SESSION_FILE, JSON.stringify(payload, null, 2), "utf8");
    writeLog("[INFO] Da luu phien Zalo vao zalo_session.json");
}

function clearZaloSession() {
    try {
        if (fs.existsSync(ZALO_SESSION_FILE)) fs.unlinkSync(ZALO_SESSION_FILE);
    } catch (_) {}
}

module.exports = { loadZaloSession, saveZaloSession, clearZaloSession };
