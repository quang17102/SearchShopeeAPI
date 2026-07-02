const WS_URL = "ws://127.0.0.1:3000/extension";
const API_BASE = "http://127.0.0.1:3000";
const SHOPEE_URL = "https://shopee.vn";
const AFFILIATE_URL = "https://affiliate.shopee.vn/";
const RECONNECT_DELAY_MS = 1000;
const KEEPALIVE_ALARM = "ws-keepalive";
const COOKIE_PUSH_ALARM = "affiliate-cookie-push";

let ws = null;
let wsReconnectTimer = null;
let wsKeepaliveTimer = null;
const searchQueue = [];
let searchRunning = false;

function getErrorMessage(err) {
  if (!err) return "unknown";
  return err.message || String(err);
}

function isReceivingEndMissingError(err) {
  return getErrorMessage(err).includes("Receiving end does not exist");
}

async function describeTab(tabId) {
  try {
    const tab = await chrome.tabs.get(tabId);
    return {
      tabId,
      url: tab.url || "(empty)",
      title: tab.title || "(no title)",
      status: tab.status || "unknown",
    };
  } catch (err) {
    return {
      tabId,
      url: "(tab not found)",
      title: "",
      status: "missing",
      error: getErrorMessage(err),
    };
  }
}

function logConnectionError(context, err, extra = {}) {
  const message = getErrorMessage(err);
  const payload = { context, message, ...extra };

  if (isReceivingEndMissingError(err)) {
    console.error(
      "[ExtSearch] LOI KET NOI: Content script chua san sang hoac tab khong co content.js",
      payload
    );
    console.error(
      "[ExtSearch] Goi y: mo https://shopee.vn, F5 trang, reload extension, roi thu lai"
    );
    return;
  }

  console.error("[ExtSearch] LOI:", payload);
}

async function readAffiliateCookie() {
  const cookies = await chrome.cookies.getAll({ url: AFFILIATE_URL });
  if (!cookies.length) return null;
  return cookies.map((c) => `${c.name}=${c.value}`).join("; ");
}

async function pushAffiliateCookie() {
  const cookie = await readAffiliateCookie();
  if (!cookie) {
    console.log("[ExtSearch] Chua co cookie affiliate.shopee.vn");
    return false;
  }

  try {
    const res = await fetch(`${API_BASE}/api/affiliate-cookie`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ cookie }),
    });

    if (res.ok) {
      console.log("[ExtSearch] Da day affiliate cookie len API");
      if (ws?.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: "affiliate_cookie", cookie }));
      }
      return true;
    }
  } catch (e) {
    console.warn("[ExtSearch] Push affiliate cookie fail:", e.message);
  }

  return false;
}

function waitTabLoad(tabId, timeout = 20000) {
  return new Promise((resolve, reject) => {
    chrome.tabs.get(tabId, (tab) => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
        return;
      }
      if (tab.status === "complete") {
        resolve();
        return;
      }

      const timer = setTimeout(() => {
        chrome.tabs.onUpdated.removeListener(listener);
        reject(new Error("Timeout chờ tab Shopee load"));
      }, timeout);

      function listener(id, info) {
        if (id === tabId && info.status === "complete") {
          clearTimeout(timer);
          chrome.tabs.onUpdated.removeListener(listener);
          resolve();
        }
      }

      chrome.tabs.onUpdated.addListener(listener);
    });
  });
}

async function getShopeeTab() {
  const tabs = await chrome.tabs.query({
    url: ["https://shopee.vn/*", "https://*.shopee.vn/*"],
  });

  if (tabs.length > 0) return tabs[0];

  const tab = await chrome.tabs.create({ url: SHOPEE_URL, active: false });
  await waitTabLoad(tab.id);
  await new Promise((r) => setTimeout(r, 2000));
  return tab;
}

async function sendSearchToTab(tabId, keyword, retries = 5) {
  let lastError = null;
  const tabInfo = await describeTab(tabId);

  for (let i = 0; i < retries; i++) {
    try {
      const res = await chrome.tabs.sendMessage(tabId, {
        action: "search",
        keyword,
      });
      if (res) return res;
      lastError = new Error("Content script không phản hồi");
      logConnectionError("sendSearchToTab.empty_response", lastError, {
        attempt: i + 1,
        retries,
        keyword,
        ...tabInfo,
      });
    } catch (e) {
      lastError = e;
      logConnectionError("sendSearchToTab.sendMessage", e, {
        attempt: i + 1,
        retries,
        keyword,
        ...tabInfo,
      });
    }
    await new Promise((r) => setTimeout(r, 1000));
  }

  const finalError =
    lastError || new Error("Không gửi được message tới content script");
  logConnectionError("sendSearchToTab.failed", finalError, {
    keyword,
    ...tabInfo,
  });
  throw finalError;
}

async function runSearch(keyword) {
  const tab = await getShopeeTab();
  console.log("[ExtSearch] Search keyword:", keyword, await describeTab(tab.id));
  const res = await sendSearchToTab(tab.id, keyword);

  if (!res?.ok) {
    throw new Error(res?.error || "Search thất bại");
  }

  return { ok: true, keyword, total: res.products.length, products: res.products };
}

function enqueueSearch(keyword) {
  return new Promise((resolve, reject) => {
    searchQueue.push({ keyword, resolve, reject });
    processSearchQueue();
  });
}

async function processSearchQueue() {
  if (searchRunning || searchQueue.length === 0) return;

  searchRunning = true;
  const { keyword, resolve, reject } = searchQueue.shift();

  try {
    resolve(await runSearch(keyword));
  } catch (e) {
    logConnectionError("processSearchQueue", e, { keyword });
    reject(e);
  } finally {
    searchRunning = false;
    processSearchQueue();
  }
}

function clearWsKeepaliveTimer() {
  if (wsKeepaliveTimer) {
    clearInterval(wsKeepaliveTimer);
    wsKeepaliveTimer = null;
  }
}

function startWsKeepaliveTimer() {
  clearWsKeepaliveTimer();
  wsKeepaliveTimer = setInterval(() => {
    if (ws?.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: "pong" }));
      return;
    }
    connectWebSocket();
  }, 20000);
}

function connectWebSocket() {
  if (ws?.readyState === WebSocket.OPEN || ws?.readyState === WebSocket.CONNECTING) {
    return;
  }

  if (wsReconnectTimer) {
    clearTimeout(wsReconnectTimer);
    wsReconnectTimer = null;
  }

  try {
    ws = new WebSocket(WS_URL);
  } catch {
    scheduleReconnect();
    return;
  }

  ws.onopen = () => {
    console.log("[ExtSearch] WebSocket connected");
    ws.send(JSON.stringify({ type: "extension_ready" }));
    pushAffiliateCookie();
    startWsKeepaliveTimer();
  };

  ws.onmessage = async (event) => {
    let msg;
    try {
      msg = JSON.parse(event.data);
    } catch {
      return;
    }

    if (msg.type === "ping") {
      if (ws?.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: "pong" }));
      }
      return;
    }

    if (msg.type !== "search" || !msg.id || !msg.keyword) return;

    try {
      const result = await enqueueSearch(msg.keyword.trim());
      if (ws?.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: "search_result", id: msg.id, ...result }));
      }
    } catch (e) {
      logConnectionError("websocket.search", e, { keyword: msg.keyword, id: msg.id });
      if (ws?.readyState === WebSocket.OPEN) {
        ws.send(
          JSON.stringify({
            type: "search_result",
            id: msg.id,
            ok: false,
            error: e.message || "Search thất bại",
          })
        );
      }
    }
  };

  ws.onclose = () => {
    ws = null;
    clearWsKeepaliveTimer();
    scheduleReconnect();
  };

  ws.onerror = () => {
    ws?.close();
  };
}

function scheduleReconnect() {
  if (wsReconnectTimer) return;
  wsReconnectTimer = setTimeout(() => {
    wsReconnectTimer = null;
    connectWebSocket();
  }, RECONNECT_DELAY_MS);
}

function setupKeepaliveAlarm() {
  chrome.alarms.create(KEEPALIVE_ALARM, { periodInMinutes: 1 });
  chrome.alarms.create(COOKIE_PUSH_ALARM, { periodInMinutes: 5 });
}

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === KEEPALIVE_ALARM) {
    connectWebSocket();
    return;
  }

  if (alarm.name === COOKIE_PUSH_ALARM) {
    pushAffiliateCookie();
  }
});

chrome.cookies.onChanged.addListener((changeInfo) => {
  const domain = changeInfo.cookie?.domain || "";
  if (!domain.includes("shopee.vn")) return;
  pushAffiliateCookie();
});

chrome.runtime.onStartup.addListener(() => {
  setupKeepaliveAlarm();
  connectWebSocket();
});

chrome.runtime.onInstalled.addListener(() => {
  setupKeepaliveAlarm();
  connectWebSocket();
});

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg.action !== "search") return;

  const keyword = msg.keyword?.trim();
  if (!keyword) {
    sendResponse({ ok: false, error: "Nhập từ khóa trước" });
    return;
  }

  enqueueSearch(keyword)
    .then((result) => sendResponse(result))
    .catch((e) => {
      logConnectionError("popup.search", e, { keyword });
      sendResponse({ ok: false, error: e.message });
    });

  return true;
});

setupKeepaliveAlarm();
connectWebSocket();
pushAffiliateCookie();
