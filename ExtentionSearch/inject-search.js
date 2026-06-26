(function () {
  if (window.__extSearchHookInstalled) return;
  window.__extSearchHookInstalled = true;

  const SEARCH_PATH = "/api/v4/search/search_items";

  function isSearchUrl(url) {
    try {
      const u = typeof url === "string" ? url : url?.url || url?.href || "";
      return u.includes(SEARCH_PATH);
    } catch {
      return false;
    }
  }

  let lastSearchData = null;

  window.__extLastSearchData = function () {
    return lastSearchData;
  };

  function emitResult(data) {
    lastSearchData = data;
    window.postMessage({ type: "SEARCH_ITEMS_RESULT", data }, "*");
  }

  const origFetch = window.fetch;
  window.fetch = async function (...args) {
    const response = await origFetch.apply(this, args);
    const url = args[0];
    if (isSearchUrl(url)) {
      response
        .clone()
        .json()
        .then(emitResult)
        .catch(() => {});
    }
    return response;
  };

  const origOpen = XMLHttpRequest.prototype.open;
  const origSend = XMLHttpRequest.prototype.send;

  XMLHttpRequest.prototype.open = function (method, url, ...rest) {
    this._extSearchUrl = url;
    return origOpen.call(this, method, url, ...rest);
  };

  XMLHttpRequest.prototype.send = function (...args) {
    if (isSearchUrl(this._extSearchUrl)) {
      this.addEventListener("load", function () {
        try {
          emitResult(JSON.parse(this.responseText));
        } catch {
          /* ignore */
        }
      });
    }
    return origSend.apply(this, args);
  };
})();
