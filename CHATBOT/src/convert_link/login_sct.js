const { HttpsProxyAgent } = require("https-proxy-agent");
const { HttpProxyAgent } = require("http-proxy-agent");

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

module.exports = { createProxyAgents };
