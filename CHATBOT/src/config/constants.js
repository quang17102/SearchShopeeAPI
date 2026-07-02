const REPLY_HASHTAG_LINES = [
    "#ShopeeVideo",
    "#LuotVuiMuaLien",
    "#ShopeeCreator",
    "#Videohangtieudung",
    "#HangMoiVe",
    "#shopee",
    "#NgoiSaoTiemNang",
    "#hangmoive",
];

const REPLY_HASHTAGS_MSG = REPLY_HASHTAG_LINES.join("\n");

function formatProductLinks(urls) {
    return (urls || []).join("\n");
}

module.exports = {
    IMAGE_SEARCH_GROUP_ID: "686881869627588936",
    BOT_LINK_OWNER_ID: "4810164586201416449",
    BOT_LINK_CMD_RE: /@bot\s+lienket\b/i,
    API_SEARCH_URL: process.env.API_SEARCH_URL || "http://127.0.0.1:3000",
    KIOTPROXY_KEY: process.env.KIOTPROXY_KEY || "K97467ea1e4d244be8de3f7aed8b87740",
    LOCSP_API_TOKEN:
        process.env.LOCSP_API_TOKEN ||
        "locsp_live_4_l5B7Yna8m7g7c3ueiYDz0OW9bRP45N7D0WIKjaZWw",
    LOCSP_BASE_URL: process.env.LOCSP_BASE_URL || "https://api.locsp.xyz",
    LOCSP_PROXY_BASE_URL:
        process.env.LOCSP_PROXY_BASE_URL ||
        "https://60cb-42-112-255-193.ngrok-free.app",
    LOCSP_PROXY_API_TOKEN:
        process.env.LOCSP_PROXY_API_TOKEN ||
        "locsp_test_BJt8-V2oGCj69ekDhVgX3AydIRgWn5cik6ZE46hQ3lk",
    KEYWORD_SEARCH_CMD_RE: /@timkiem\s+(.+)/i,
    ALLOWED_SHOPEE_URL_RE:
        /https:\/\/(?:www\.)?shopee\.vn[^\s]*|https:\/\/s\.shopee\.vn[^\s]*|https:\/\/vn\.shp\.ee[^\s]*|https:\/\/s\.shp\.ee[^\s]*/i,
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
    REPLY_HASHTAG_LINES,
    REPLY_HASHTAGS_MSG,
    formatProductLinks,
};
