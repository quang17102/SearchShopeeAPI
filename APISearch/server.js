const http = require("http");
const crypto = require("crypto");
const express = require("express");
const { WebSocketServer } = require("ws");

const PORT = Number(process.env.PORT) || 3000;
const SEARCH_TIMEOUT_MS = 30000;
const MAX_PRODUCTS = 20;

const app = express();
app.use(express.json());

let extensionSocket = null;
const pendingSearches = new Map();

function isExtensionConnected() {
  return extensionSocket?.readyState === 1;
}

function formatSearchResponse(result) {
  const urls = (result.products || [])
    .slice(0, MAX_PRODUCTS)
    .map((p) => p.url)
    .filter(Boolean);

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

function requestSearch(keyword) {
  return new Promise((resolve, reject) => {
    if (!isExtensionConnected()) {
      reject(new Error("Extension chưa kết nối. Mở Chrome và load extension."));
      return;
    }

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

    extensionSocket.send(
      JSON.stringify({ type: "search", id, keyword })
    );
  });
}

app.get("/health", (_req, res) => {
  res.json({
    ok: true,
    extensionConnected: isExtensionConnected(),
  });
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
  if (extensionSocket) {
    extensionSocket.close();
  }
  extensionSocket = ws;
  console.log("[APISearch] Extension connected");

  ws.on("message", (raw) => {
    let msg;
    try {
      msg = JSON.parse(raw.toString());
    } catch {
      return;
    }

    if (msg.type === "extension_ready") {
      console.log("[APISearch] Extension ready");
      return;
    }

    if (msg.type !== "search_result" || !msg.id) return;

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
  });

  ws.on("close", () => {
    if (extensionSocket === ws) {
      extensionSocket = null;
      console.log("[APISearch] Extension disconnected");
    }

    for (const [id, pending] of pendingSearches) {
      pending.reject(new Error("Extension ngắt kết nối"));
      pendingSearches.delete(id);
    }
  });
});

server.listen(PORT, "127.0.0.1", () => {
  console.log(`[APISearch] HTTP  http://127.0.0.1:${PORT}`);
  console.log(`[APISearch] WS    ws://127.0.0.1:${PORT}/extension`);
});
