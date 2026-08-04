const { API_SEARCH_URL } = require("../config/constants");

const IMAGE_SEARCH_TIMEOUT_MS = 60_000;

async function runImageSearchFromUrl(imageUrl) {
  try {
    const res = await fetch(`${API_SEARCH_URL}/api/image-search`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ imageUrl }),
      signal: AbortSignal.timeout(IMAGE_SEARCH_TIMEOUT_MS),
    });
    const data = await res.json();

    if (!res.ok || !data.ok) {
      const message = data.error || `HTTP ${res.status}`;
      return { ok: false, urls: [], count: 0, message, error: message };
    }

    return { ok: true, urls: data.urls || [], count: data.total ?? (data.urls?.length || 0) };
  } catch (e) {
    const message = `Lỗi kết nối APISearch: ${e.message}`;
    return { ok: false, urls: [], count: 0, message, error: message };
  }
}

module.exports = { runImageSearchFromUrl };
