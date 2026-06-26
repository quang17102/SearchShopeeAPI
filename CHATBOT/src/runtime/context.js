module.exports = {
    currentZaloApi: null,
    zaloListenerHeartbeatIntervalId: null,
    botMessageQueue: Promise.resolve(),
    zaloRuntimeGeneration: 0,
    zaloReloginInFlight: false,
    zaloFatalExitScheduled: false,
};
