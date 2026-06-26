const { writeLog } = require("./logger");

function formatErrDetail(err) {
    if (!err) return "unknown";
    if (err.stack) return err.stack;
    if (err.message) return err.message;
    try {
        return JSON.stringify(err);
    } catch (_) {
        return String(err);
    }
}

function installProcessAbnormalLogging() {
    if (global.__botProcessLoggingInstalled) return;
    global.__botProcessLoggingInstalled = true;

    process.on("uncaughtException", (err) => {
        writeLog(`[FATAL] uncaughtException: ${formatErrDetail(err)}`);
    });

    process.on("unhandledRejection", (reason) => {
        writeLog(`[FATAL] unhandledRejection: ${formatErrDetail(reason)}`);
    });

    for (const sig of ["SIGINT", "SIGTERM"]) {
        process.on(sig, () => {
            writeLog(`[INFO] Nhan tin hieu ${sig} — dang thoat process`);
            process.exit(0);
        });
    }
}

module.exports = {
    formatErrDetail,
    installProcessAbnormalLogging,
};
