const axios = require("axios");

const API_URL = "https://addlivetag.com/shopee-affiliate-api/api_handler.php";
const COMMISSION_TIMEOUT_MS = 10000;

const COMMISSION_HEADERS = {
  accept: "*/*",
  "content-type": "application/json",
  origin: "https://addlivetag.com",
  referer: "https://addlivetag.com/shopee-affiliate-api/product_data.php",
  "x-requested-with": "XMLHttpRequest",
};

async function getCommission(productUrl) {
  const response = await axios.post(
    API_URL,
    { api_type: "productData", params: { url: productUrl } },
    {
      timeout: COMMISSION_TIMEOUT_MS,
      headers: COMMISSION_HEADERS,
    }
  );

  const p = response?.data?.data?.productInfo;
  if (!p) return null;

  return p.imageUrl ?? null;
}

module.exports = { getCommission };
