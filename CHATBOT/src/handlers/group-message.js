const { writeLog } = require("../infra/logger");
const { formatErrDetail } = require("../infra/utils");
const { getZaloApi } = require("../zalo/runtime");
const { runImageSearchFromUrl } = require("../image-search/run-python-search");
const { runKeywordSearch } = require("../keyword-search/run-api-search");
const {
    IMAGE_SEARCH_GROUP_ID,
    KEYWORD_SEARCH_CMD_RE,
    ZALO_PHOTO_URL_RE,
} = require("../config/constants");

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

async function replyInGroup(api, threadId, messageType, msg) {
    await api.sendMessage({ msg }, threadId, messageType);
}

async function handleImageSearchInGroup(message, imageUrl) {
    const api = getZaloApi();
    if (!api) return;

    const threadId = String(message.threadId);
    const messageType = message.type;

    writeLog(`[IMAGE_SEARCH] group=${threadId} url=${imageUrl}`);

    try {
        await replyInGroup(api, threadId, messageType, "🔍 Đang tìm kiếm sản phẩm từ ảnh...");

        const result = await runImageSearchFromUrl(imageUrl);
        const reply = result.ok
            ? result.message
            : result.message || result.error || "Lỗi tìm kiếm ảnh.";

        await replyInGroup(api, threadId, messageType, reply);
        writeLog(`[IMAGE_SEARCH] done group=${threadId} ok=${Boolean(result.ok)}`);
    } catch (e) {
        writeLog(`[ERROR] image_search: ${formatErrDetail(e)}`);
        try {
            await replyInGroup(
                api,
                threadId,
                messageType,
                "Lỗi tìm kiếm ảnh. Vui lòng thử lại sau."
            );
        } catch (sendErr) {
            writeLog(`[ERROR] image_search reply: ${formatErrDetail(sendErr)}`);
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
        await replyInGroup(api, threadId, messageType, "🔍 Đang tìm kiếm sản phẩm...");

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

        const reply = result.urls?.length
            ? result.urls.join("\n")
            : "Không tìm thấy sản phẩm.";

        await replyInGroup(api, threadId, messageType, reply);
        writeLog(
            `[KEYWORD_SEARCH] done group=${threadId} keyword="${keyword}" total=${result.urls?.length || 0}`
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

    if (isImageSearchTarget(groupId, text)) {
        await handleImageSearchInGroup(message, text);
    }
}

module.exports = {
    handleGroupMessage,
    isGroupMessage,
    extractText,
    isImageSearchTarget,
    isKeywordSearchCommand,
    extractKeywordFromCommand,
};
