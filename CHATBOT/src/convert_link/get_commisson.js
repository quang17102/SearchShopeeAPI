const axios = require("axios");
const { HttpsProxyAgent } = require("https-proxy-agent");
const { HttpProxyAgent } = require("http-proxy-agent");

const API_URL = "https://addlivetag.com/shopee-affiliate-api/api_handler.php";

function createProxyAgents(proxies) {
  if (!proxies || typeof proxies !== "object") return null;
  const rawProxy = String(proxies.http || proxies.https || "").trim();
  if (!rawProxy) return null;
  const proxyUrl = /^https?:\/\//i.test(rawProxy) ? rawProxy : `http://${rawProxy}`;

  return {
    httpsAgent: new HttpsProxyAgent(proxyUrl),
    httpAgent: new HttpProxyAgent(proxyUrl),
  };
}

async function getCommission(productUrl, proxies) {
  const agents = createProxyAgents(proxies);

  const response = await axios.post(
    API_URL,
    { api_type: "productData", params: { url: productUrl } },
    {
      timeout: 10000,
      headers: {
        accept: "*/*",
        "content-type": "application/json",
        origin: "https://addlivetag.com",
        referer: "https://addlivetag.com/shopee-affiliate-api/product_data.php",
        "x-requested-with": "XMLHttpRequest",
      },
      ...(agents
        ? {
            httpsAgent: agents.httpsAgent,
            httpAgent: agents.httpAgent,
            proxy: false, // quan trọng khi dùng agent
          }
        : {}),
    }
  );

  const p = response?.data?.data?.productInfo;
  if (!p) return null;

  return {
    isXtra: p.isXtra ?? null,
  };
}

module.exports = { getCommission };