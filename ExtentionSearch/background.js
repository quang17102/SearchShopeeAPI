const WS_URL = "ws://127.0.0.1:3000/extension";
const API_BASE = "http://127.0.0.1:3000";
const SHOPEE_URL = "https://shopee.vn";
const AFFILIATE_URL = "https://affiliate.shopee.vn/";
const RECONNECT_DELAY_MS = 1000;
const KEEPALIVE_ALARM = "ws-keepalive";
const COOKIE_PUSH_ALARM = "affiliate-cookie-push";
const PAGE_REFRESH_ALARM = "page-refresh";
const PAGE_REFRESH_MINUTES = 60;
const IMAGE_SEARCH_REFRESH_EVERY = 5;
const IMAGE_CDN_BASE = "https://down-zl-vn.img.susercontent.com";
const PRODUCT_CAPTURE_TIMEOUT_MS = 20000;

let ws = null;
let wsReconnectTimer = null;
let wsKeepaliveTimer = null;
const searchQueue = [];
const workerTabIds = new Set();

function excludeWorkerTabs(tabs) {
  return tabs.filter((t) => !workerTabIds.has(t.id));
}
let searchRunning = false;

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

async function refreshCurrentTab() {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab?.id) return;

    const url = tab.url || "";
    await chrome.tabs.reload(tab.id, { bypassCache: false });
    await waitTabLoad(tab.id);
    console.log("[ExtSearch] Da refresh tab hien tai:", url || tab.id);

    if (url.includes("affiliate.shopee.vn")) {
      await pushAffiliateCookie();
    }
  } catch (e) {
    console.warn("[ExtSearch] Refresh tab hien tai fail:", e.message);
  }
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

async function refreshAffiliateTab() {
  try {
    const tabs = excludeWorkerTabs(
      await chrome.tabs.query({ url: ["https://affiliate.shopee.vn/*"] })
    );
    const tab = tabs[0];
    if (!tab?.id) return;

    await chrome.tabs.reload(tab.id, { bypassCache: false });
    await waitTabLoad(tab.id);
    await new Promise((r) => setTimeout(r, 1500));
    console.log(`[ExtSearch] Da refresh tab affiliate sau ${IMAGE_SEARCH_REFRESH_EVERY} lan search anh`);
    await pushAffiliateCookie();
  } catch (e) {
    console.warn("[ExtSearch] Refresh tab affiliate fail:", e.message);
  }
}

async function getAffiliateTab() {
  const tabs = excludeWorkerTabs(
    await chrome.tabs.query({ url: ["https://affiliate.shopee.vn/*"] })
  );

  if (tabs.length > 0) return tabs[0];

  const tab = await chrome.tabs.create({ url: AFFILIATE_URL, active: false });
  await waitTabLoad(tab.id);
  await new Promise((r) => setTimeout(r, 2000));
  return tab;
}

async function sendCaptchaToTab(tabId, retries = 5) {
  let lastError = null;

  for (let i = 0; i < retries; i++) {
    try {
      const res = await chrome.tabs.sendMessage(tabId, { action: "captcha" });
      if (res) return res;
      lastError = new Error("Content script affiliate không phản hồi");
    } catch (e) {
      lastError = e;
    }
    await new Promise((r) => setTimeout(r, 1000));
  }

  throw lastError || new Error("Không gửi được message tới affiliate content script");
}

async function runCaptchaTest() {
  const tab = await getAffiliateTab();
  const res = await sendCaptchaToTab(tab.id);

  if (!res?.ok) {
    throw new Error(res?.error || "Captcha test thất bại");
  }

  return res;
}

async function sendImageSearchToTab(tabId, payload, retries = 3) {
  let lastError = null;

  for (let i = 0; i < retries; i++) {
    try {
      const res = await chrome.tabs.sendMessage(tabId, {
        action: "image_search",
        ...payload,
      });
      if (res) return res;
      lastError = new Error("Content script affiliate không phản hồi");
    } catch (e) {
      lastError = e;
    }
    await new Promise((r) => setTimeout(r, 1000));
  }

  throw lastError || new Error("Không gửi được message tới affiliate content script");
}

async function runImageSearch(imageBase64, filename, mime) {
  const tab = await getAffiliateTab();
  const res = await sendImageSearchToTab(tab.id, { imageBase64, filename, mime });

  if (!res?.ok) {
    throw new Error(res?.error || "Search ảnh thất bại");
  }

  return { ok: true, urls: res.urls };
}

const imageSearchQueue = [];
let imageSearchRunning = false;
let imageSearchCount = 0;

function enqueueImageSearch(imageBase64, filename, mime) {
  return new Promise((resolve, reject) => {
    imageSearchQueue.push({ imageBase64, filename, mime, resolve, reject });
    processImageSearchQueue();
  });
}

async function processImageSearchQueue() {
  if (imageSearchRunning || imageSearchQueue.length === 0) return;

  imageSearchRunning = true;
  const { imageBase64, filename, mime, resolve, reject } = imageSearchQueue.shift();

  try {
    resolve(await runImageSearch(imageBase64, filename, mime));
  } catch (e) {
    reject(e);
  } finally {
    imageSearchCount += 1;
    if (imageSearchCount % IMAGE_SEARCH_REFRESH_EVERY === 0) {
      await refreshAffiliateTab();
    }
    imageSearchRunning = false;
    processImageSearchQueue();
  }
}

async function getShopeeTab() {
  const tabs = excludeWorkerTabs(
    await chrome.tabs.query({
      url: ["https://shopee.vn/*", "https://*.shopee.vn/*"],
    })
  );

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

function parseIdsFromProductUrl(url) {
  const str = String(url || "");
  const match =
    str.match(/\/product\/(\d+)\/(\d+)/) ||
    str.match(/-i\.(\d+)\.(\d+)/) ||
    str.match(/shopee\.vn\/[^/?#]+\/(\d+)\/(\d+)/);
  if (match) return { shopId: match[1], itemId: match[2] };

  const itemId = str.match(/[?&]item_?id=(\d+)/i)?.[1];
  if (!itemId) return null;
  return { shopId: str.match(/[?&]shop_?id=(\d+)/i)?.[1] || "", itemId };
}

// Tab load cham khong phai loi: content script chay tu document_start, van bat duoc API
async function openWorkerTab(url, loadTimeout = 30000) {
  const tab = await chrome.tabs.create({ url, active: false });
  workerTabIds.add(tab.id);
  try {
    await waitTabLoad(tab.id, loadTimeout);
  } catch (e) {
    console.warn("[ExtSearch] Tab worker load cham:", url, e.message);
  }
  return tab.id;
}

async function closeWorkerTab(tabId) {
  if (tabId == null) return;
  workerTabIds.delete(tabId);
  try {
    await chrome.tabs.remove(tabId);
  } catch {
    /* tab da dong */
  }
}

// Trang /product/shop/item co the redirect -> content script nap lai, kenh message dong -> thu lai
async function requestProductCapture(tabId, payload, deadlineMs = 30000) {
  const deadline = Date.now() + deadlineMs;
  let lastError = null;

  while (Date.now() < deadline) {
    try {
      const res = await chrome.tabs.sendMessage(tabId, {
        action: "product_capture_get",
        ...payload,
      });
      if (res) return res;
      lastError = new Error("Content script product-capture không phản hồi");
    } catch (e) {
      lastError = e;
    }
    await new Promise((r) => setTimeout(r, 1000));
  }

  throw lastError || new Error("Không gửi được message tới product-capture");
}

async function resolveItemId(productUrl) {
  // item_id luon lay tu get_pc; URL chi dung khi get_pc that bai sau khi da cho het timeout
  const urlIds = parseIdsFromProductUrl(productUrl);
  const tabId = await openWorkerTab(productUrl, 5000);
  try {
    let res = null;
    try {
      res = await requestProductCapture(tabId, {
        kind: "get_pc",
        timeout: PRODUCT_CAPTURE_TIMEOUT_MS,
        waitForOk: true,
      });
    } catch (e) {
      res = { ok: false, error: e.message };
    }

    const item = res?.data?.data?.item;
    if (res?.ok && item?.item_id) {
      const itemId = String(item.item_id);
      console.log("[ExtSearch] item_id tu get_pc:", itemId);
      return {
        itemId,
        shopId: String(item.shop_id || urlIds?.shopId || ""),
        pcImage: item.image || null,
      };
    }

    // get_pc khong bat duoc (captcha/anti-bot) -> lay tu link goc hoac URL tab sau redirect
    const tab = await chrome.tabs.get(tabId).catch(() => null);
    const ids = urlIds || parseIdsFromProductUrl(tab?.url);
    const pcError = res?.error || `get_pc code=${res?.data?.error ?? res?.data?.code ?? "?"}`;
    if (ids) {
      console.warn("[ExtSearch] get_pc fail (", pcError, "), item_id tu URL:", ids.itemId);
      return { ...ids, pcImage: null };
    }

    throw new Error(
      `[get_pc] Không xác định được item_id: ${pcError} | tabUrl=${tab?.url || "?"}`
    );
  } finally {
    await closeWorkerTab(tabId);
  }
}

function pickOfferImage(offerData) {
  const card = offerData?.data?.batch_item_for_item_card_full;
  const entry = Array.isArray(card) ? card[0] : card;
  return entry?.image || null;
}

async function fetchAffiliateImageId(itemId) {
  const tabId = await openWorkerTab(
    `https://affiliate.shopee.vn/offer/product_offer/${itemId}`
  );
  try {
    const res = await requestProductCapture(tabId, {
      kind: "offer_product",
      urlIncludes: `item_id=${itemId}`,
      timeout: PRODUCT_CAPTURE_TIMEOUT_MS,
      fallbackFetchUrl: `/api/v3/offer/product?item_id=${itemId}`,
    });

    if (!res?.ok) {
      throw new Error(`[affiliate] ${res?.error || "Không bắt được API offer/product"}`);
    }

    const image = pickOfferImage(res.data);
    if (!image) {
      throw new Error(
        `[affiliate] offer/product không có image (code=${res.data?.code ?? "?"} msg=${res.data?.msg ?? ""})`
      );
    }
    return image;
  } finally {
    await closeWorkerTab(tabId);
  }
}

async function runProductImage(productUrl) {
  const { itemId, shopId, pcImage } = await resolveItemId(productUrl);

  let imageId;
  try {
    imageId = await fetchAffiliateImageId(itemId);
  } catch (e) {
    // offer/product loi (vd code=599 getProductDetail error) -> dung anh tu get_pc
    if (!pcImage) throw e;
    console.warn("[ExtSearch] offer/product fail, dung anh get_pc:", e.message);
    imageId = pcImage;
  }

  return {
    ok: true,
    itemId,
    shopId,
    imageId,
    imageUrl: `${IMAGE_CDN_BASE}/${imageId}.webp`,
  };
}

const productImageQueue = [];
let productImageRunning = false;

function enqueueProductImage(productUrl) {
  return new Promise((resolve, reject) => {
    productImageQueue.push({ productUrl, resolve, reject });
    processProductImageQueue();
  });
}

async function processProductImageQueue() {
  if (productImageRunning || productImageQueue.length === 0) return;

  productImageRunning = true;
  const { productUrl, resolve, reject } = productImageQueue.shift();

  try {
    resolve(await runProductImage(productUrl));
  } catch (e) {
    reject(e);
  } finally {
    productImageRunning = false;
    processProductImageQueue();
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

    if (msg.type === "image_search" && msg.id && msg.imageBase64) {
      try {
        const result = await enqueueImageSearch(msg.imageBase64, msg.filename, msg.mime);
        if (ws?.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({ type: "image_search_result", id: msg.id, ...result }));
        }
      } catch (e) {
        if (ws?.readyState === WebSocket.OPEN) {
          ws.send(
            JSON.stringify({
              type: "image_search_result",
              id: msg.id,
              ok: false,
              error: e.message || "Search ảnh thất bại",
            })
          );
        }
      }
      return;
    }

    if (msg.type === "product_image" && msg.id && msg.url) {
      try {
        const result = await enqueueProductImage(msg.url);
        if (ws?.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({ type: "product_image_result", id: msg.id, ...result }));
        }
      } catch (e) {
        if (ws?.readyState === WebSocket.OPEN) {
          ws.send(
            JSON.stringify({
              type: "product_image_result",
              id: msg.id,
              ok: false,
              error: e.message || "Lấy ảnh sản phẩm thất bại",
            })
          );
        }
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
  chrome.alarms.create(PAGE_REFRESH_ALARM, { periodInMinutes: PAGE_REFRESH_MINUTES });
}

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === KEEPALIVE_ALARM) {
    connectWebSocket();
    return;
  }

  if (alarm.name === COOKIE_PUSH_ALARM) {
    pushAffiliateCookie();
    return;
  }

  if (alarm.name === PAGE_REFRESH_ALARM) {
    refreshCurrentTab();
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
  if (msg.action === "captcha") {
    runCaptchaTest()
      .then((result) => sendResponse(result))
      .catch((e) => sendResponse({ ok: false, error: e.message }));
    return true;
  }

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

setupKeepaliveAlarm();
connectWebSocket();
pushAffiliateCookie();
