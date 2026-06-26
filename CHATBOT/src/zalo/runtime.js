const { writeLog } = require("../infra/logger");
const { formatErrDetail } = require("../infra/utils");
const {
    ZALO_LISTENER_HEARTBEAT_MS,
    ZALO_RELOGIN_MAX_ATTEMPTS,
    ZALO_RELOGIN_COOLDOWN_MS,
} = require("../config/constants");
const ctx = require("../runtime/context");
const { describeWsCloseCode, wsReadyStateLabel } = require("./ws-utils");
const { acquireZaloApi } = require("./login");

function getZaloApi() {
    return ctx.currentZaloApi;
}

function enqueueBotWork(fn) {
    const gen = ctx.zaloRuntimeGeneration;
    ctx.botMessageQueue = ctx.botMessageQueue
        .then(() => {
            if (gen !== ctx.zaloRuntimeGeneration) return;
            if (!ctx.currentZaloApi) return;
            return fn();
        })
        .catch((err) => {
            writeLog(`[ERROR] Loi queue bot work: ${formatErrDetail(err)}`);
        });
}

function teardownZaloRuntime() {
    ctx.zaloRuntimeGeneration++;

    if (ctx.zaloListenerHeartbeatIntervalId != null) {
        clearInterval(ctx.zaloListenerHeartbeatIntervalId);
        ctx.zaloListenerHeartbeatIntervalId = null;
    }

    try {
        ctx.currentZaloApi?.listener?.stop?.();
    } catch (e) {
        writeLog(`[WARN] Zalo listener stop: ${formatErrDetail(e)}`);
    }

    ctx.currentZaloApi = null;
    ctx.botMessageQueue = Promise.resolve();
    writeLog("[INFO] Zalo runtime: da teardown (listener + queue)");
}

function exitAfterZaloReloginFailed(summary) {
    if (ctx.zaloFatalExitScheduled) return;
    ctx.zaloFatalExitScheduled = true;
    teardownZaloRuntime();
    writeLog(
        `[FATAL] Zalo: da thu login lai ${ZALO_RELOGIN_MAX_ATTEMPTS} lan khong thanh cong. ${summary}. Ket thuc process.`
    );
    process.exit(1);
}

function scheduleZaloRelogin(zalo, bootstrapAfterLogin, source, detail) {
    if (ctx.zaloReloginInFlight || ctx.zaloFatalExitScheduled) return;
    writeLog(
        `[INFO] Zalo: kich hoat login lai (nguon=${source}${detail != null ? `, ${detail}` : ""})`
    );
    void reloginZaloWithRetry(zalo, bootstrapAfterLogin);
}

async function reloginZaloWithRetry(zalo, bootstrapAfterLogin) {
    if (ctx.zaloReloginInFlight || ctx.zaloFatalExitScheduled) return false;
    ctx.zaloReloginInFlight = true;

    try {
        teardownZaloRuntime();

        for (let attempt = 1; attempt <= ZALO_RELOGIN_MAX_ATTEMPTS; attempt++) {
            writeLog(`[INFO] Zalo login lai — lan ${attempt}/${ZALO_RELOGIN_MAX_ATTEMPTS}...`);
            try {
                const api = await acquireZaloApi(zalo);
                await bootstrapAfterLogin(api);
                writeLog(`[SUCCESS] Zalo login lai thanh cong (lan ${attempt})`);
                return true;
            } catch (e) {
                writeLog(
                    `[WARN] Zalo login lai lan ${attempt}/${ZALO_RELOGIN_MAX_ATTEMPTS} that bai: ${formatErrDetail(e)}`
                );
                if (attempt < ZALO_RELOGIN_MAX_ATTEMPTS) {
                    await new Promise((r) => setTimeout(r, ZALO_RELOGIN_COOLDOWN_MS));
                }
            }
        }

        exitAfterZaloReloginFailed(
            "Khong the khoi phuc ket noi Zalo (mat WS / kick / phien het han / trung Zalo Web)"
        );
        return false;
    } finally {
        ctx.zaloReloginInFlight = false;
    }
}

function attachZaloListenerMonitoring(api, onWsUnhealthy) {
    const listener = api && api.listener;
    if (!listener || listener.__botMonitoringAttached) return;
    listener.__botMonitoringAttached = true;

    listener.on("connected", () => {
        writeLog("[INFO] Zalo listener: WebSocket connected");
    });

    listener.on("disconnected", (code, reason) => {
        writeLog(`[WARN] Zalo listener: disconnected — ${describeWsCloseCode(code, reason)}`);
    });

    listener.on("closed", (code, reason) => {
        writeLog(
            `[WARN] Zalo listener: closed — ${describeWsCloseCode(code, reason)} — se thu login lai`
        );
        onWsUnhealthy?.("closed", describeWsCloseCode(code, reason));
    });

    listener.on("error", (err) => {
        writeLog(`[WARN] Zalo listener error: ${formatErrDetail(err)}`);
    });

    if (ctx.zaloListenerHeartbeatIntervalId != null) {
        clearInterval(ctx.zaloListenerHeartbeatIntervalId);
    }
    ctx.zaloListenerHeartbeatIntervalId = setInterval(() => {
        const state = wsReadyStateLabel(listener.ws);
        if (state !== "OPEN") {
            writeLog(`[WARN] Zalo listener heartbeat: WS=${state} — co the mat ket noi hoac bi kick`);
            onWsUnhealthy?.("heartbeat", `WS=${state}`);
        }
    }, ZALO_LISTENER_HEARTBEAT_MS);

    writeLog(
        `[INFO] Zalo listener: bat giam sat bat thuong (heartbeat ${ZALO_LISTENER_HEARTBEAT_MS / 1000}s)`
    );
}

module.exports = {
    getZaloApi,
    enqueueBotWork,
    teardownZaloRuntime,
    scheduleZaloRelogin,
    attachZaloListenerMonitoring,
};
