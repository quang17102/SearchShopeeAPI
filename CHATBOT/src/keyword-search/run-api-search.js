const { API_SEARCH_URL } = require("../config/constants");

const SEARCH_TIMEOUT_MS = 35_000;

async function runKeywordSearch(keyword) {
  const url = `${API_SEARCH_URL}/api/search?keyword=${encodeURIComponent(keyword)}`;
  const res = await fetch(url, { signal: AbortSignal.timeout(SEARCH_TIMEOUT_MS) });
  const data = await res.json();

  if (!res.ok) {
    return { ok: false, error: data.error || `HTTP ${res.status}` };
  }

  return data;
}

module.exports = { runKeywordSearch };
