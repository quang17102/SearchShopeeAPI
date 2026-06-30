const { writeLog } = require("../infra/logger");
const { formatErrDetail } = require("../infra/utils");
const { getZaloApi } = require("../zalo/runtime");
const { getCommission } = require("../convert_link/get_commisson");
const { runImageSearchFromUrl } = require("../image-search/run-python-search");
const { runKeywordSearch } = require("../keyword-search/run-api-search");
const {
    ALLOWED_SHOPEE_URL_RE,
    formatProductReply,
    IMAGE_SEARCH_GROUP_ID,
    KEYWORD_SEARCH_CMD_RE,
    ZALO_PHOTO_URL_RE,
} = require("../config/constants");

const MAX_KEYWORD_URLS = 50;
const ZALO_MSG_CHUNK_SIZE = 1800;
const SEARCH_STATUS_MSG = "Đang tìm kiếm sản phẩm...";

function isGroupMessage(message) {
    const threadId = String(message?.threadId || "");
    const senderId = String(message?.data?.uidFrom || "");
    return Boolean(threadId && senderId && threadId !== senderId);
}

function extractText(message) {
    const content = message?.data?.content;
    if (typeof content === "string") return content.trim();
    if (content && typeof content === "object") {
        return String(content.title || content.href || JSON.stringify(content)).trim();
    }
    return "";
}

function isTargetGroup(groupId) {
    return String(groupId) === IMAGE_SEARCH_GROUP_ID;
}

function isImageSearchTarget(groupId, text) {
    return isTargetGroup(groupId) && ZALO_PHOTO_URL_RE.test(text);
}

function isKeywordSearchCommand(text) {
    return /@timkiem\b/i.test(text);
}

function extractKeywordFromCommand(text) {
    const match = text.match(KEYWORD_SEARCH_CMD_RE);
    return match ? match[1].trim() : null;
}

function extractShopeeUrl(text) {
    const match = text.match(ALLOWED_SHOPEE_URL_RE);
    return match ? match[0] : null;
}

async function replyInGroup(api, threadId, messageType, msg) {
    await api.sendMessage({ msg }, threadId, messageType);
}

function splitMessageForZalo(text, chunkSize = ZALO_MSG_CHUNK_SIZE) {
    if (text.length <= chunkSize) return [text];

    const lines = text.split("\n");
    const chunks = [];
    let current = "";

    for (const line of lines) {
        const next = current ? `${current}\n${line}` : line;
        if (next.length > chunkSize && current) {
            chunks.push(current);
            current = line;
        } else {
            current = next;
        }
    }

    if (current) chunks.push(current);
    return chunks;
}

async function runAndReplyImageSearch(
    message,
    imageUrl,
    { logLabel = "IMAGE_SEARCH", sendStatus = true } = {}
) {
    const api = getZaloApi();
    if (!api) return;

    const threadId = String(message.threadId);
    const messageType = message.type;

    writeLog(`[${logLabel}] group=${threadId} imageUrl=${imageUrl}`);

    try {
        if (sendStatus) {
            await replyInGroup(api, threadId, messageType, SEARCH_STATUS_MSG);
        }

        const result = await runImageSearchFromUrl(imageUrl);

        if (!result.ok) {
            await replyInGroup(
                api,
                threadId,
                messageType,
                result.message || result.error || "Lỗi tìm kiếm ảnh."
            );
            writeLog(`[${logLabel}] failed group=${threadId} error=${result.error}`);
            return;
        }

        const parts = result.messages?.length ? result.messages : [result.message];
        for (const part of parts) {
            await replyInGroup(api, threadId, messageType, part);
        }

        writeLog(
            `[${logLabel}] done group=${threadId} ok=true count=${result.count ?? 0}`
        );
    } catch (e) {
        writeLog(`[ERROR] ${logLabel.toLowerCase()}: ${formatErrDetail(e)}`);
        try {
            await replyInGroup(
                api,
                threadId,
                messageType,
                "Lỗi tìm kiếm ảnh. Vui lòng thử lại sau."
            );
        } catch (sendErr) {
            writeLog(`[ERROR] ${logLabel.toLowerCase()} reply: ${formatErrDetail(sendErr)}`);
        }
    }
}

async function handleImageSearchInGroup(message, imageUrl) {
    await runAndReplyImageSearch(message, imageUrl);
}

async function handleShopeeLinkSearchInGroup(message, shopeeUrl) {
    const api = getZaloApi();
    if (!api) return;

    const threadId = String(message.threadId);
    const messageType = message.type;

    writeLog(`[SHOPEE_LINK_SEARCH] group=${threadId} shopeeUrl=${shopeeUrl}`);

    try {
        await replyInGroup(api, threadId, messageType, SEARCH_STATUS_MSG);

        const imageUrl = await getCommission(shopeeUrl);
        if (!imageUrl) {
            await replyInGroup(
                api,
                threadId,
                messageType,
                "Không lấy được ảnh sản phẩm từ link này."
            );
            writeLog(`[SHOPEE_LINK_SEARCH] failed group=${threadId} no imageUrl`);
            return;
        }

        await runAndReplyImageSearch(message, imageUrl, {
            logLabel: "SHOPEE_LINK_SEARCH",
            sendStatus: false,
        });
    } catch (e) {
        writeLog(`[ERROR] shopee_link_search: ${formatErrDetail(e)}`);
        try {
            await replyInGroup(
                api,
                threadId,
                messageType,
                "Lỗi xử lý link Shopee. Vui lòng thử lại sau."
            );
        } catch (sendErr) {
            writeLog(`[ERROR] shopee_link_search reply: ${formatErrDetail(sendErr)}`);
        }
    }
}

async function handleKeywordSearchInGroup(message, keyword) {
    const api = getZaloApi();
    if (!api) return;

    const threadId = String(message.threadId);
    const messageType = message.type;

    writeLog(`[KEYWORD_SEARCH] group=${threadId} keyword="${keyword}"`);

    try {
        await replyInGroup(api, threadId, messageType, SEARCH_STATUS_MSG);

        const result = await runKeywordSearch(keyword);

        if (!result.ok) {
            await replyInGroup(
                api,
                threadId,
                messageType,
                result.error || "Lỗi tìm kiếm. Vui lòng thử lại sau."
            );
            writeLog(`[KEYWORD_SEARCH] failed group=${threadId} error=${result.error}`);
            return;
        }

        const urls = (result.urls || []).slice(0, MAX_KEYWORD_URLS);
        const reply = formatProductReply(urls);

        const parts = splitMessageForZalo(reply);
        for (const part of parts) {
            await replyInGroup(api, threadId, messageType, part);
        }

        writeLog(
            `[KEYWORD_SEARCH] done group=${threadId} keyword="${keyword}" count=${urls.length}`
        );
    } catch (e) {
        writeLog(`[ERROR] keyword_search: ${formatErrDetail(e)}`);
        try {
            await replyInGroup(
                api,
                threadId,
                messageType,
                "Lỗi tìm kiếm. Kiểm tra APISearch server và extension."
            );
        } catch (sendErr) {
            writeLog(`[ERROR] keyword_search reply: ${formatErrDetail(sendErr)}`);
        }
    }
}

async function handleGroupMessage(message) {
    if (message.isSelf) return;
    if (!isGroupMessage(message)) return;

    const d = message.data || {};
    const text = extractText(message);
    const groupId = String(message.threadId);

    writeLog(
        `[GROUP] groupId=${groupId} ` +
            `senderId=${d.uidFrom} senderName=${String(d.dName || "").trim()} ` +
            `content="${text}"`
    );
    console.log(`[GROUP] ${groupId} | ${d.dName}: ${text}`);

    if (!isTargetGroup(groupId)) return;

    if (isKeywordSearchCommand(text)) {
        const keyword = extractKeywordFromCommand(text);
        if (!keyword) {
            const api = getZaloApi();
            if (api) {
                await replyInGroup(
                    api,
                    groupId,
                    message.type,
                    "Vui lòng nhập: @timkiem <từ khóa>\nVí dụ: @timkiem freeship9"
                );
            }
            return;
        }
        await handleKeywordSearchInGroup(message, keyword);
        return;
    }

    const shopeeUrl = extractShopeeUrl(text);
    if (shopeeUrl) {
        await handleShopeeLinkSearchInGroup(message, shopeeUrl);
        return;
    }

    if (isImageSearchTarget(groupId, text)) {
        await handleImageSearchInGroup(message, text);
    }
}

module.exports = {
    handleGroupMessage,
    isGroupMessage,
    extractText,
    extractShopeeUrl,
    isImageSearchTarget,
    isKeywordSearchCommand,
    extractKeywordFromCommand,
};
