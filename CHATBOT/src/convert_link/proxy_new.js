/**
 * KiotProxy: get_new truoc, loi thi get_current; cache { proxy, thoi gian } theo key, TTL 5 phut.
 * Tuong duong y get_proxy_kiotproxy trong proxy.py + moc thoi gian.
 */

const axios = require("axios");
const path = require("path");
const { createProxyAgents } = require(path.join(__dirname, "login_sct.js"));

const KIOTPROXY_TIMEOUT_MS = 5000;
const DEFAULT_TIMEOUT_MS = 10000;
/** 5 phut */
const PROXY_TTL_MS = 5 * 60 * 1000;

/** So lan goi lai fetchKiotProxyFresh sau lan dau (tong lan = 1 + maxRetries) */
const DEFAULT_PROXY_FETCH_MAX_RETRIES = 3;
const DEFAULT_PROXY_RETRY_DELAY_MS = 400;

/** @type {Map<string, { proxies: { http: string, https: string }, savedAt: number }>} */
const kiotProxyTtlCache = new Map();

function hasEffectiveProxies(proxies) {
  if (!proxies || typeof proxies !== "object") return false;
  return Boolean(String(proxies.http || proxies.https || "").trim());
}

function axiosProxyOptions(proxies, timeoutMs = DEFAULT_TIMEOUT_MS) {
  const ms = Math.max(5000, Number(timeoutMs) || DEFAULT_TIMEOUT_MS);
  if (!hasEffectiveProxies(proxies)) {
    return { proxy: false, timeout: ms };
  }
  const agents = createProxyAgents(proxies);
  if (!agents) {
    return { proxy: false, timeout: ms };
  }
  return {
    httpsAgent: agents.httpsAgent,
    httpAgent: agents.httpAgent,
    proxy: false,
    timeout: ms,
  };
}

function clearKiotProxyCache(key) {
  const safeKey = String(key || "").trim();
  if (!safeKey) {
    kiotProxyTtlCache.clear();
    return;
  }
  kiotProxyTtlCache.delete(safeKey);
}

/**
 * @param {string} key
 * @param {"bac"|"trung"|"nam"|"random"} [region="random"]
 * @param {number} [timeoutSeconds=5]
 * @returns {Promise<object>}
 */
async function getNewProxyKiotProxy(key, region = "random", timeoutSeconds = 5) {
  const safeKey = String(key || "").trim();
  const safeRegion = String(region || "random").trim() || "random";
  if (!safeKey) {
    return { success: false, status: "INVALID_KEY", error: "Missing key" };
  }
  const timeoutMs = Math.max(1000, Number(timeoutSeconds) * 1000 || KIOTPROXY_TIMEOUT_MS);
  try {
    const resp = await axios.get("https://api.kiotproxy.com/api/v1/proxies/new", {
      params: { key: safeKey, region: safeRegion },
      timeout: timeoutMs,
      validateStatus: () => true,
    });
    let data = resp.data;
    if (typeof data === "string") {
      try {
        data = JSON.parse(data);
      } catch (_e) {
        return {
          success: false,
          code: resp.status,
          status: "HTTP_ERROR",
          error: `Cannot parse JSON, status=${resp.status}`,
          raw: data,
        };
      }
    }
    if (data && typeof data === "object" && !Array.isArray(data)) {
      if (data.http_status == null) data.http_status = resp.status;
      return data;
    }
    return {
      success: false,
      code: resp.status,
      status: "HTTP_ERROR",
      error: "Unexpected response format",
    };
  } catch (exc) {
    return {
      success: false,
      status: "REQUEST_EXCEPTION",
      error: exc && exc.message ? String(exc.message) : String(exc),
    };
  }
}

/**
 * @param {string} key
 * @param {number} [timeoutSeconds=5]
 * @returns {Promise<object>}
 */
async function getCurrentProxyKiotProxy(key, timeoutSeconds = 5) {
  const safeKey = String(key || "").trim();
  if (!safeKey) {
    return { success: false, status: "INVALID_KEY", error: "Missing key" };
  }
  const timeoutMs = Math.max(1000, Number(timeoutSeconds) * 1000 || KIOTPROXY_TIMEOUT_MS);
  try {
    const resp = await axios.get(
      `https://api.kiotproxy.com/api/v1/proxies/current?key=${encodeURIComponent(safeKey)}`,
      {
        timeout: timeoutMs,
        validateStatus: () => true,
      }
    );
    let data = resp.data;
    if (typeof data === "string") {
      try {
        data = JSON.parse(data);
      } catch (_e) {
        return {
          success: false,
          code: resp.status,
          status: "HTTP_ERROR",
          error: `Cannot parse JSON, status=${resp.status}`,
          raw: data,
        };
      }
    }
    if (data && typeof data === "object" && !Array.isArray(data)) {
      if (data.http_status == null) data.http_status = resp.status;
      return data;
    }
    return {
      success: false,
      code: resp.status,
      status: "HTTP_ERROR",
      error: "Unexpected response format",
    };
  } catch (exc) {
    return {
      success: false,
      status: "REQUEST_EXCEPTION",
      error: exc && exc.message ? String(exc.message) : String(exc),
    };
  }
}

function proxiesFromApiResult(result) {
  if (!result || !result.success || !result.data || typeof result.data !== "object") {
    return null;
  }
  const http = String(result.data.http || "").trim();
  if (!http) return null;
  return { http, https: http };
}

/**
 * Luon goi API: new -> (neu khong success va khong KEY_EXPIRED) current.
 * @returns {Promise<{ http: string, https: string } | "KEY_EXPIRED" | null>}
 */
async function fetchKiotProxyFresh(key, timeoutSeconds = 5) {
  const safeKey = String(key || "").trim();
  if (!safeKey) return null;

  console.log(`[KiotProxy] FETCH_NEW key=${safeKey.slice(0, 6)}… (api /proxies/new)`);
  let result = await getNewProxyKiotProxy(safeKey, "random", timeoutSeconds);
  let proxies = proxiesFromApiResult(result);
  if (proxies) {
    console.log(`[KiotProxy] NEW_OK key=${safeKey.slice(0, 6)}…`);
    return proxies;
  }

  if (result && result.error === "KEY_EXPIRED") {
    console.log(`[KiotProxy] NEW_KEY_EXPIRED key=${safeKey.slice(0, 6)}… (khong goi current)`);
    return "KEY_EXPIRED";
  }

  console.log(`[KiotProxy] FETCH_CURRENT key=${safeKey.slice(0, 6)}… (api /proxies/current, sau khi new that bai)`);
  result = await getCurrentProxyKiotProxy(safeKey, timeoutSeconds);
  proxies = proxiesFromApiResult(result);
  if (proxies) {
    console.log(`[KiotProxy] CURRENT_OK key=${safeKey.slice(0, 6)}…`);
    return proxies;
  }

  console.log(`[KiotProxy] FETCH_FAIL key=${safeKey.slice(0, 6)}… (new + current deu khong co proxy hop le)`);
  return null;
}

/**
 * Cache 5 phut theo key: trong TTL tra proxy da luu; het han thi goi lai new -> current.
 * Khi fetch tra null (loi tam thoi): retry them maxRetries lan, co delay giua cac lan.
 *
 * @param {string} key
 * @param {number} [timeoutSeconds=5]
 * @param {{ maxRetries?: number, retryDelayMs?: number }} [opts] maxRetries mac dinh 2 (3 lan fetch); KEY_EXPIRED khong retry
 * @returns {Promise<{ http: string, https: string } | "KEY_EXPIRED" | null>}
 */
async function getProxyKiotProxy(key, timeoutSeconds = 5, opts = {}) {
  const safeKey = String(key || "").trim();
  if (!safeKey) return null;

  const maxRetriesRaw = opts && opts.maxRetries != null ? Number(opts.maxRetries) : DEFAULT_PROXY_FETCH_MAX_RETRIES;
  const maxRetries = Math.max(0, Math.min(Number.isFinite(maxRetriesRaw) ? maxRetriesRaw : DEFAULT_PROXY_FETCH_MAX_RETRIES, 10));
  const delayRaw = opts && opts.retryDelayMs != null ? Number(opts.retryDelayMs) : DEFAULT_PROXY_RETRY_DELAY_MS;
  const retryDelayMs = Math.max(0, Number.isFinite(delayRaw) ? delayRaw : DEFAULT_PROXY_RETRY_DELAY_MS);

  const now = Date.now();
  const entry = kiotProxyTtlCache.get(safeKey);
  if (entry && entry.proxies && entry.proxies.http && now - entry.savedAt < PROXY_TTL_MS) {
    const ageSec = Math.round((now - entry.savedAt) / 1000);
    console.log(
      `[KiotProxy] CACHE_HIT key=${safeKey.slice(0, 6)}… age=${ageSec}s ttl=${PROXY_TTL_MS / 1000}s`
    );
    return {
      http: entry.proxies.http,
      https: entry.proxies.https || entry.proxies.http,
    };
  }

  if (entry && entry.proxies && entry.proxies.http) {
    const ageSec = Math.round((now - entry.savedAt) / 1000);
    console.log(
      `[KiotProxy] CACHE_EXPIRED key=${safeKey.slice(0, 6)}… age=${ageSec}s > ttl, goi fetchKiotProxyFresh`
    );
  } else {
    console.log(`[KiotProxy] CACHE_MISS key=${safeKey.slice(0, 6)}… (chua co hoac khong hop le)`);
  }

  let fresh = null;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    if (attempt > 0) {
      console.log(
        `[KiotProxy] RETRY attempt=${attempt}/${maxRetries} key=${safeKey.slice(0, 6)}… delay=${retryDelayMs}ms`
      );
      await new Promise((r) => setTimeout(r, retryDelayMs));
    }
    fresh = await fetchKiotProxyFresh(safeKey, timeoutSeconds);
    if (fresh === "KEY_EXPIRED") {
      kiotProxyTtlCache.delete(safeKey);
      return "KEY_EXPIRED";
    }
    if (fresh) {
      kiotProxyTtlCache.set(safeKey, { proxies: fresh, savedAt: Date.now() });
      return fresh;
    }
  }

  return null;
}

module.exports = {
  PROXY_TTL_MS,
  DEFAULT_TIMEOUT_MS,
  DEFAULT_PROXY_FETCH_MAX_RETRIES,
  DEFAULT_PROXY_RETRY_DELAY_MS,
  hasEffectiveProxies,
  getNewProxyKiotProxy,
  getCurrentProxyKiotProxy,
  fetchKiotProxyFresh,
  getProxyKiotProxy,
  clearKiotProxyCache,
  axiosProxyOptions,
};

