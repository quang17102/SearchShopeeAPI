const { API_SEARCH_URL } = require("../config/constants");

const PRODUCT_IMAGE_TIMEOUT_MS = 95_000;

// Extension mo tab get_pc -> item_id, roi tab affiliate offer/product -> image
async function getProductImage(productUrl) {
  const res = await fetch(`${API_SEARCH_URL}/api/product-image`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ url: productUrl }),
    signal: AbortSignal.timeout(PRODUCT_IMAGE_TIMEOUT_MS),
  });
  const data = await res.json().catch(() => ({}));

  if (!res.ok || !data.ok) {
    throw new Error(`product-image HTTP ${res.status}: ${data.error || "unknown"}`);
  }

  return data.imageUrl || null;
}

module.exports = { getProductImage };
