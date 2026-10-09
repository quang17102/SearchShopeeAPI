const http = require("http");
const crypto = require("crypto");
const express = require("express");
const { WebSocketServer } = require("ws");

const PORT = Number(process.env.PORT) || 3000;
const SEARCH_TIMEOUT_MS = 30000;
const PRODUCT_IMAGE_TIMEOUT_MS = 90000;
const EXTENSION_WAIT_MS = 15000;
const EXTENSION_POLL_MS = 500;
const PING_INTERVAL_MS = 25000;
const DISCONNECT_GRACE_MS = 3000;
const MAX_SEARCH_URLS = 35;
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

const IMAGE_DOWNLOAD_HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/142.0.0.0 Safari/537.36",
  Accept: "image/avif,image/webp,image/apng,image/*,*/*;q=0.8",
};

const app = express();
app.use(express.json());

let extensionSocket = null;
const pendingSearches = new Map();
const disconnectGraceTimers = new Map();

let affiliateCookie = null;
let affiliateCookieUpdatedAt = 0;

function setAffiliateCookie(cookie) {
  const value = String(cookie || "").trim();
  if (!value) return false;
  affiliateCookie = value;
  affiliateCookieUpdatedAt = Date.now();
  console.log("[APISearch] Affiliate cookie updated");
  return true;
}

function isExtensionConnected() {
  return extensionSocket?.readyState === 1;
}

function waitForExtension(timeoutMs = EXTENSION_WAIT_MS) {
  return new Promise((resolve, reject) => {
    if (isExtensionConnected()) {
      resolve();
      return;
    }

    const start = Date.now();
    const timer = setInterval(() => {
      if (isExtensionConnected()) {
        clearInterval(timer);
        resolve();
        return;
      }

      if (Date.now() - start > timeoutMs) {
        clearInterval(timer);
        reject(
          new Error("Extension chưa kết nối. Mở Chrome và load extension.")
        );
      }
    }, EXTENSION_POLL_MS);
  });
}

function formatSearchResponse(result) {
  const urls = (result.products || [])
    .map((p) => p.url)
    .filter(Boolean)
    .slice(0, MAX_SEARCH_URLS);

  return {
    ok: result.ok !== false,
    keyword: result.keyword,
    total: urls.length,
    urls,
  };
}

async function handleSearch(keyword, res) {
  try {
    const result = await requestSearch(keyword);
    if (!result.ok) {
      return res.status(502).json({
        ok: false,
        error: result.error || "Search thất bại",
      });
    }
    res.json(formatSearchResponse(result));
  } catch (e) {
    const status = e.message.includes("Extension chưa kết nối") ? 503 : 504;
    res.status(status).json({ ok: false, error: e.message });
  }
}

async function requestSearch(keyword) {
  await waitForExtension();

  return new Promise((resolve, reject) => {
    const id = crypto.randomUUID();
    const timer = setTimeout(() => {
      pendingSearches.delete(id);
      reject(new Error("Timeout chờ extension trả kết quả"));
    }, SEARCH_TIMEOUT_MS);

    pendingSearches.set(id, {
      resolve: (payload) => {
        clearTimeout(timer);
        resolve(payload);
      },
      reject: (err) => {
        clearTimeout(timer);
        reject(err);
      },
    });

    extensionSocket.send(JSON.stringify({ type: "search", id, keyword }));
  });
}

async function downloadImageAsBase64(imageUrl) {
  const res = await fetch(imageUrl, { headers: IMAGE_DOWNLOAD_HEADERS });
  if (!res.ok) {
    throw new Error(`Không tải được ảnh: HTTP ${res.status}`);
  }

  const buffer = Buffer.from(await res.arrayBuffer());
  if (buffer.length > MAX_IMAGE_BYTES) {
    throw new Error("Ảnh lớn hơn 5 MB");
  }

  const contentType = String(res.headers.get("content-type") || "")
    .split(";")[0]
    .trim()
    .toLowerCase();
  const filename =
    contentType === "image/png"
      ? "photo.png"
      : contentType === "image/webp"
        ? "photo.webp"
        : "photo.jpg";

  return {
    base64: buffer.toString("base64"),
    filename,
    mime: contentType || "image/jpeg",
  };
}

function formatImageSearchResponse(result) {
  const urls = (result.urls || []).slice(0, MAX_SEARCH_URLS);
  return { ok: result.ok !== false, total: urls.length, urls };
}

async function handleImageSearch(imageUrl, res) {
  try {
    const result = await requestImageSearch(imageUrl);
    if (!result.ok) {
      return res.status(502).json({
        ok: false,
        error: result.error || "Search ảnh thất bại",
      });
    }
    res.json(formatImageSearchResponse(result));
  } catch (e) {
    const status = e.message.includes("Extension chưa kết nối") ? 503 : 504;
    res.status(status).json({ ok: false, error: e.message });
  }
}

async function requestImageSearch(imageUrl) {
  const { base64, filename, mime } = await downloadImageAsBase64(imageUrl);
  await waitForExtension();

  return new Promise((resolve, reject) => {
    const id = crypto.randomUUID();
    const timer = setTimeout(() => {
      pendingSearches.delete(id);
      reject(new Error("Timeout chờ extension trả kết quả search ảnh"));
    }, SEARCH_TIMEOUT_MS);

    pendingSearches.set(id, {
      resolve: (payload) => {
        clearTimeout(timer);
        resolve(payload);
      },
      reject: (err) => {
        clearTimeout(timer);
        reject(err);
      },
    });

    extensionSocket.send(
      JSON.stringify({
        type: "image_search",
        id,
        imageBase64: base64,
        filename,
        mime,
      })
    );
  });
}

async function requestProductImage(productUrl) {
  await waitForExtension();

  return new Promise((resolve, reject) => {
    const id = crypto.randomUUID();
    const timer = setTimeout(() => {
      pendingSearches.delete(id);
      reject(new Error("Timeout chờ extension lấy ảnh sản phẩm"));
    }, PRODUCT_IMAGE_TIMEOUT_MS);

    pendingSearches.set(id, {
      resolve: (payload) => {
        clearTimeout(timer);
        resolve(payload);
      },
      reject: (err) => {
        clearTimeout(timer);
        reject(err);
      },
    });

    extensionSocket.send(JSON.stringify({ type: "product_image", id, url: productUrl }));
  });
}

async function handleProductImage(productUrl, res) {
  try {
    const result = await requestProductImage(productUrl);
    if (!result.ok) {
      return res.status(502).json({
        ok: false,
        error: result.error || "Lấy ảnh sản phẩm thất bại",
      });
    }
    res.json(result);
  } catch (e) {
    const status = e.message.includes("Extension chưa kết nối") ? 503 : 504;
    res.status(status).json({ ok: false, error: e.message });
  }
}

function rejectPendingSearches(reason) {
  for (const [id, pending] of pendingSearches) {
    pending.reject(new Error(reason));
    pendingSearches.delete(id);
  }
}

function schedulePendingReject(ws, reason) {
  if (disconnectGraceTimers.has(ws)) return;

  const graceTimer = setTimeout(() => {
    disconnectGraceTimers.delete(ws);
    if (isExtensionConnected()) return;
    rejectPendingSearches(reason);
  }, DISCONNECT_GRACE_MS);

  disconnectGraceTimers.set(ws, graceTimer);
}

function clearDisconnectGrace(ws) {
  const timer = disconnectGraceTimers.get(ws);
  if (!timer) return;
  clearTimeout(timer);
  disconnectGraceTimers.delete(ws);
}

app.get("/health", (_req, res) => {
  res.json({
    ok: true,
    extensionConnected: isExtensionConnected(),
    affiliateCookieReady: Boolean(affiliateCookie),
    affiliateCookieUpdatedAt,
  });
});

app.get("/api/affiliate-cookie", (_req, res) => {
  if (!affiliateCookie) {
    return res.status(503).json({
      ok: false,
      error: "Cookie affiliate chưa có. Đăng nhập affiliate.shopee.vn và bật extension.",
    });
  }

  res.json({
    ok: true,
    cookie: affiliateCookie,
    updatedAt: affiliateCookieUpdatedAt,
  });
});

app.post("/api/affiliate-cookie", (req, res) => {
  const cookie = String(req.body?.cookie || "").trim();
  if (!cookie) {
    return res.status(400).json({ ok: false, error: "cookie required" });
  }

  setAffiliateCookie(cookie);
  res.json({ ok: true, updatedAt: affiliateCookieUpdatedAt });
});

app.get("/api/search", async (req, res) => {
  const keyword = String(req.query.keyword || "").trim();
  if (!keyword) {
    return res.status(400).json({ ok: false, error: "keyword required" });
  }

  await handleSearch(keyword, res);
});

app.post("/api/search", async (req, res) => {
  const keyword = String(req.body?.keyword || "").trim();
  if (!keyword) {
    return res.status(400).json({ ok: false, error: "keyword required" });
  }

  await handleSearch(keyword, res);
});

app.post("/api/image-search", async (req, res) => {
  const imageUrl = String(req.body?.imageUrl || "").trim();
  if (!imageUrl) {
    return res.status(400).json({ ok: false, error: "imageUrl required" });
  }

  await handleImageSearch(imageUrl, res);
});

app.post("/api/product-image", async (req, res) => {
  const productUrl = String(req.body?.url || "").trim();
  if (!productUrl) {
    return res.status(400).json({ ok: false, error: "url required" });
  }

  await handleProductImage(productUrl, res);
});

const server = http.createServer(app);
const wss = new WebSocketServer({ noServer: true });

server.on("upgrade", (req, socket, head) => {
  if (req.url !== "/extension") {
    socket.destroy();
    return;
  }

  wss.handleUpgrade(req, socket, head, (ws) => {
    wss.emit("connection", ws, req);
  });
});

wss.on("connection", (ws) => {
  if (extensionSocket && extensionSocket !== ws) {
    clearDisconnectGrace(extensionSocket);
    extensionSocket.close();
  }

  extensionSocket = ws;
  ws.isAlive = true;
  console.log("[APISearch] Extension connected");

  const pingTimer = setInterval(() => {
    if (ws.readyState !== 1) return;

    if (!ws.isAlive) {
      clearInterval(pingTimer);
      ws.terminate();
      return;
    }

    ws.isAlive = false;
    ws.ping();
    ws.send(JSON.stringify({ type: "ping" }));
  }, PING_INTERVAL_MS);

  ws.on("pong", () => {
    ws.isAlive = true;
  });

  ws.on("message", (raw) => {
    let msg;
    try {
      msg = JSON.parse(raw.toString());
    } catch {
      return;
    }

    if (msg.type === "pong") {
      ws.isAlive = true;
      return;
    }

    if (msg.type === "extension_ready") {
      console.log("[APISearch] Extension ready");
      return;
    }

    if (msg.type === "affiliate_cookie") {
      setAffiliateCookie(msg.cookie);
      return;
    }

    if (msg.type === "search_result" && msg.id) {
      const pending = pendingSearches.get(msg.id);
      if (!pending) return;

      pendingSearches.delete(msg.id);
      pending.resolve({
        ok: msg.ok !== false,
        keyword: msg.keyword,
        total: msg.total ?? (msg.products?.length || 0),
        products: msg.products || [],
        error: msg.error,
      });
      return;
    }

    if (msg.type === "image_search_result" && msg.id) {
      const pending = pendingSearches.get(msg.id);
      if (!pending) return;

      pendingSearches.delete(msg.id);
      pending.resolve({
        ok: msg.ok !== false,
        urls: msg.urls || [],
        error: msg.error,
      });
      return;
    }

    if (msg.type === "product_image_result" && msg.id) {
      const pending = pendingSearches.get(msg.id);
      if (!pending) return;

      pendingSearches.delete(msg.id);
      pending.resolve({
        ok: msg.ok !== false,
        itemId: msg.itemId,
        shopId: msg.shopId,
        imageId: msg.imageId,
        imageUrl: msg.imageUrl,
        error: msg.error,
      });
    }
  });

  ws.on("close", () => {
    clearInterval(pingTimer);
    clearDisconnectGrace(ws);

    if (extensionSocket === ws) {
      extensionSocket = null;
      console.log("[APISearch] Extension disconnected — cho reconnect...");
      schedulePendingReject(ws, "Extension ngắt kết nối");
    }
  });
});

server.listen(PORT, "127.0.0.1", () => {
  console.log(`[APISearch] HTTP  http://127.0.0.1:${PORT}`);
  console.log(`[APISearch] WS    ws://127.0.0.1:${PORT}/extension`);
});
