const ctx = require("../runtime/context");
const { writeLog } = require("../infra/logger");
const { wsReadyStateLabel } = require("./ws-utils");
const { enqueueBotWork, attachZaloListenerMonitoring } = require("./runtime");
const { handleGroupMessage } = require("../handlers/group-message");

async function bootstrapZaloRuntime(api, onWsUnhealthy) {
    ctx.currentZaloApi = api;
    attachZaloListenerMonitoring(api, onWsUnhealthy);

    api.listener.on("message", (message) => {
        enqueueBotWork(() => handleGroupMessage(message));
    });

    api.listener.start({ retryOnClose: true });
    writeLog(`[INFO] Zalo listener.start() — WS=${wsReadyStateLabel(api.listener.ws)}`);
}

module.exports = { bootstrapZaloRuntime };
