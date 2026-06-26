const WS_URL = "ws://127.0.0.1:3000/extension";
const SHOPEE_URL = "https://shopee.vn";

let ws = null;
let wsReconnectTimer = null;
const searchQueue = [];
let searchRunning = false;

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

  for (let i = 0; i < retries; i++) {
    try {
      const res = await chrome.tabs.sendMessage(tabId, {
        action: "search",
        keyword,
      });
      if (res) return res;
      lastError = new Error("Content script không phản hồi");
    } catch (e) {
      lastError = e;
    }
    await new Promise((r) => setTimeout(r, 1000));
  }

  throw lastError || new Error("Không gửi được message tới content script");
}

async function runSearch(keyword) {
  const tab = await getShopeeTab();
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
    reject(e);
  } finally {
    searchRunning = false;
    processSearchQueue();
  }
}

function connectWebSocket() {
  if (ws?.readyState === WebSocket.OPEN) return;

  try {
    ws = new WebSocket(WS_URL);
  } catch {
    scheduleReconnect();
    return;
  }

  ws.onopen = () => {
    console.log("[APISearch] WebSocket connected");
    ws.send(JSON.stringify({ type: "extension_ready" }));
  };

  ws.onmessage = async (event) => {
    let msg;
    try {
      msg = JSON.parse(event.data);
    } catch {
      return;
    }

    if (msg.type !== "search" || !msg.id || !msg.keyword) return;

    try {
      const result = await enqueueSearch(msg.keyword.trim());
      ws.send(JSON.stringify({ type: "search_result", id: msg.id, ...result }));
    } catch (e) {
      ws.send(
        JSON.stringify({
          type: "search_result",
          id: msg.id,
          ok: false,
          error: e.message || "Search thất bại",
        })
      );
    }
  };

  ws.onclose = () => {
    ws = null;
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
  }, 3000);
}

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg.action !== "search") return;

  const keyword = msg.keyword?.trim();
  if (!keyword) {
    sendResponse({ ok: false, error: "Nhập từ khóa trước" });
    return;
  }

  enqueueSearch(keyword)
    .then((result) => sendResponse(result))
    .catch((e) => sendResponse({ ok: false, error: e.message }));

  return true;
});

connectWebSocket();
