const { WS_CLOSE_LABELS } = require("../config/constants");

function describeWsCloseCode(code, reason) {
    const n = Number(code);
    const label = WS_CLOSE_LABELS[n] || `code=${code}`;
    const r = reason != null && String(reason).trim() ? ` reason=${String(reason)}` : "";
    return `${label}${r}`;
}

function wsReadyStateLabel(ws) {
    if (!ws) return "NO_WS";
    const labels = ["CONNECTING", "OPEN", "CLOSING", "CLOSED"];
    return labels[ws.readyState] != null ? labels[ws.readyState] : `unknown(${ws.readyState})`;
}

module.exports = { describeWsCloseCode, wsReadyStateLabel };
