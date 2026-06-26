const { writeLog } = require("../infra/logger");
const { formatErrDetail, installProcessAbnormalLogging } = require("../infra/utils");
const { Zalo } = require("../bootstrap/zca");
const { acquireZaloApi } = require("../zalo/login");
const { scheduleZaloRelogin } = require("../zalo/runtime");
const { bootstrapZaloRuntime } = require("../zalo/bootstrap");

installProcessAbnormalLogging();

async function startBot() {
    console.log("==========================================");
    console.log("[INFO] ZALO GROUP MESSAGE LISTENER");
    console.log("==========================================\n");

    const zalo = new Zalo({ checkUpdate: true });

    const onWsUnhealthy = (source, detail) => {
        scheduleZaloRelogin(zalo, bootstrapAfterLogin, source, detail);
    };

    async function bootstrapAfterLogin(api) {
        writeLog("[SUCCESS] Dang nhap thanh cong!");
        writeLog("[INFO] Dang lang nghe tin nhan nhom...");
        await bootstrapZaloRuntime(api, onWsUnhealthy);
    }

    try {
        const api = await acquireZaloApi(zalo);
        await bootstrapAfterLogin(api);
    } catch (err) {
        writeLog(`[ERROR] Loi dang nhap he thong: ${formatErrDetail(err)}`);
    }
}

module.exports = { startBot };
