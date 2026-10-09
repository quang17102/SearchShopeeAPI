const { writeLog } = require("./logger");

function formatErrDetail(err) {
    if (!err) return "unknown";
    if (err.response) {
        let body;
        try {
            body = typeof err.response.data === "string" ? err.response.data : JSON.stringify(err.response.data);
        } catch (_) {
            body = String(err.response.data);
        }
        return `${err.message} | url=${err.config?.url} | body=${String(body).slice(0, 500)}`;
    }
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
