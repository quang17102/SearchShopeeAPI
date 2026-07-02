const path = require("path");

const ROOT = path.join(__dirname, "..", "..");

module.exports = {
    ROOT,
    LOG_FILE: path.join(ROOT, "zalo_debug_log.txt"),
    QR_FILE: path.join(ROOT, "qr_login.png"),
    ZALO_SESSION_FILE: path.join(ROOT, "zalo_session.json"),
    LINKED_GROUPS_FILE: path.join(ROOT, "linked_groups.json"),
};
