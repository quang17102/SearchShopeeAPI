module.exports = {
    IMAGE_SEARCH_GROUP_ID: "686881869627588936",
    API_SEARCH_URL: process.env.API_SEARCH_URL || "http://127.0.0.1:3000",
    KEYWORD_SEARCH_CMD_RE: /@timkiem\s+(.+)/i,
    ZALO_PHOTO_URL_RE: /^https:\/\/photo[^\s"]+/i,
    ZALO_USER_AGENT:
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
    ZALO_LANGUAGE: "vi",
    ZALO_LISTENER_HEARTBEAT_MS: 120_000,
    ZALO_RELOGIN_MAX_ATTEMPTS: 2,
    ZALO_RELOGIN_COOLDOWN_MS: 5_000,
    WS_CLOSE_LABELS: {
        1000: "ManualClosure",
        1006: "AbnormalClosure",
        3000: "DuplicateConnection (co the dang mo Zalo Web/trinh duyet khac)",
        3003: "KickConnection (Zalo da kick phien listener)",
    },
};
