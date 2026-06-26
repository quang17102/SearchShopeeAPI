const { writeLog } = require("../infra/logger");

let Zalo;
let ThreadType;
let LoginQRCallbackEventType;

try {
    const lib = require("zca-js");
    Zalo = lib.Zalo;
    ThreadType = lib.ThreadType;
    LoginQRCallbackEventType = lib.LoginQRCallbackEventType;
} catch (e) {
    writeLog("[ERROR] Loi nap thu vien zca-js: " + e.message);
    process.exit(1);
}

module.exports = { Zalo, ThreadType, LoginQRCallbackEventType };
