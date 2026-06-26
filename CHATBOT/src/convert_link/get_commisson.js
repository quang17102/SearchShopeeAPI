const axios = require("axios");
const { axiosProxyOptions, getProxyKiotProxy, hasEffectiveProxies } = require("./proxy_new");
const { KIOTPROXY_KEY } = require("../config/constants");

const API_URL = "https://addlivetag.com/shopee-affiliate-api/api_handler.php";
const COMMISSION_TIMEOUT_MS = 10000;
const MAX_PRODUCTS = 10;
const BATCH_CONCURRENCY = 5;

const COMMISSION_HEADERS = {
  accept: "*/*",
  "content-type": "application/json",
  origin: "https://addlivetag.com",
  referer: "https://addlivetag.com/shopee-affiliate-api/product_data.php",
  "x-requested-with": "XMLHttpRequest",
};

async function resolveProxies(proxies) {
  if (hasEffectiveProxies(proxies)) return proxies;

  if (!KIOTPROXY_KEY) return null;

  const fresh = await getProxyKiotProxy(KIOTPROXY_KEY);
  if (fresh === "KEY_EXPIRED") {
    console.warn("[WARN] KiotProxy key het han, thu direct");
    return null;
  }
  return fresh;
}

async function requestCommission(productUrl, proxies) {
  const response = await axios.post(
    API_URL,
    { api_type: "productData", params: { url: productUrl } },
    {
      ...axiosProxyOptions(proxies, COMMISSION_TIMEOUT_MS),
      headers: COMMISSION_HEADERS,
    }
  );

  const p = response?.data?.data?.productInfo;
  if (!p) return null;

  return {
    isXtra: p.isXtra ?? null,
  };
}

async function getCommission(productUrl, proxies = null) {
  const effectiveProxies = await resolveProxies(proxies);

  if (hasEffectiveProxies(effectiveProxies)) {
    try {
      return await requestCommission(productUrl, effectiveProxies);
    } catch (err) {
      const detail = err.response?.status
        ? `status ${err.response.status}`
        : err.message;
      console.warn(`[WARN] getCommission qua proxy fail: ${detail}, thu direct`);
      return await requestCommission(productUrl, null);
    }
  }

  return await requestCommission(productUrl, null);
}

async function getCommissionBatch(urls, proxies = null, limit = MAX_PRODUCTS) {
  const effectiveProxies = await resolveProxies(proxies);
  const targets = (urls || []).slice(0, limit);
  const results = [];

  for (let i = 0; i < targets.length; i += BATCH_CONCURRENCY) {
    const batch = targets.slice(i, i + BATCH_CONCURRENCY);
    const settled = await Promise.allSettled(
      batch.map(async (url) => {
        const data = await getCommission(url, effectiveProxies);
        return { url, data };
      })
    );

    for (let j = 0; j < settled.length; j++) {
      const item = settled[j];
      if (item.status === "fulfilled") {
        results.push(item.value);
      } else {
        results.push({
          url: batch[j],
          error: item.reason?.message || String(item.reason),
        });
      }
    }
  }

  return results;
}

async function getXtraUrls(urls, proxies = null, limit = MAX_PRODUCTS) {
  const effectiveProxies = await resolveProxies(proxies);
  const targets = urls || [];
  const xtraUrls = [];
  const results = [];

  for (let i = 0; i < targets.length; i += BATCH_CONCURRENCY) {
    if (xtraUrls.length >= limit) break;

    const batch = targets.slice(i, i + BATCH_CONCURRENCY);
    const settled = await Promise.allSettled(
      batch.map(async (url) => {
        const data = await getCommission(url, effectiveProxies);
        return { url, data };
      })
    );

    for (let j = 0; j < settled.length; j++) {
      const item = settled[j];
      const entry =
        item.status === "fulfilled"
          ? item.value
          : { url: batch[j], error: item.reason?.message || String(item.reason) };

      results.push(entry);

      if (!entry.error && entry.data?.isXtra === true && xtraUrls.length < limit) {
        xtraUrls.push(entry.url);
      }

      if (xtraUrls.length >= limit) break;
    }

    if (xtraUrls.length >= limit) break;
  }

  return { xtraUrls, results };
}

module.exports = {
  MAX_PRODUCTS,
  getCommission,
  getCommissionBatch,
  getXtraUrls,
  resolveProxies,
};
