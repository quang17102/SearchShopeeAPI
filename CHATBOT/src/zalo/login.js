const fs = require("fs");
const { writeLog } = require("../infra/logger");
const { formatErrDetail } = require("../infra/utils");
const { QR_FILE } = require("../config/paths");
const { ZALO_USER_AGENT, ZALO_LANGUAGE } = require("../config/constants");
const { LoginQRCallbackEventType } = require("../bootstrap/zca");
const { loadZaloSession, saveZaloSession, clearZaloSession } = require("./session");

async function loginZaloWithQR(zalo) {
    if (fs.existsSync(QR_FILE)) fs.unlinkSync(QR_FILE);
    writeLog("[INFO] Dang tao ma QR dang nhap...");

    let qWatcher = setInterval(() => {
        if (fs.existsSync(QR_FILE)) {
            console.log(`\n[ACTION] Da tao ma QR. Vui long mo file qr_login.png de quet.\n`);
            clearInterval(qWatcher);
            qWatcher = null;
        }
    }, 1000);

    try {
        return await zalo.loginQR(
            { qrPath: QR_FILE, userAgent: ZALO_USER_AGENT, language: ZALO_LANGUAGE },
            (event) => {
                if (!LoginQRCallbackEventType) return;
                if (event.type === LoginQRCallbackEventType.QRCodeExpired) {
                    writeLog("[WARN] Ma QR het han — chay lai node main.js de tao ma moi");
                    return;
                }
                if (event.type === LoginQRCallbackEventType.QRCodeDeclined) {
                    writeLog("[WARN] Nguoi dung tu choi dang nhap QR tren dien thoai");
                    return;
                }
                if (event.type === LoginQRCallbackEventType.QRCodeGenerated && event.actions) {
                    void event.actions.saveToFile(QR_FILE).catch((e) => {
                        writeLog(`[ERROR] Luu ma QR: ${formatErrDetail(e)}`);
                    });
                    return;
                }
                if (event.type === LoginQRCallbackEventType.GotLoginInfo && event.data) {
                    saveZaloSession({
                        cookie: event.data.cookie,
                        imei: event.data.imei,
                        userAgent: event.data.userAgent,
                        language: ZALO_LANGUAGE,
                    });
                }
            }
        );
    } finally {
        if (qWatcher) clearInterval(qWatcher);
    }
}

async function acquireZaloApi(zalo) {
    const saved = loadZaloSession();
    if (saved) {
        writeLog("[INFO] Thu dang nhap bang phien da luu (zalo_session.json)...");
        try {
            const api = await zalo.login({
                cookie: saved.cookie,
                imei: saved.imei,
                userAgent: saved.userAgent,
                language: saved.language,
            });
            writeLog("[SUCCESS] Dang nhap bang phien da luu thanh cong!");
            return api;
        } catch (e) {
            writeLog(
                `[WARN] Phien da luu khong hop le: ${formatErrDetail(e)} — xoa file va chuyen sang QR...`
            );
            clearZaloSession();
        }
    }
    return loginZaloWithQR(zalo);
}

module.exports = { loginZaloWithQR, acquireZaloApi };
