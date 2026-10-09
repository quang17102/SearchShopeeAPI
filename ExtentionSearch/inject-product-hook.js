(function () {
  if (window.__extProductHookInstalled) return;
  window.__extProductHookInstalled = true;

  const CAPTURE_RULES = [
    { kind: "get_pc", path: "/api/v4/pdp/get_pc" },
    { kind: "offer_product", path: "/api/v3/offer/product" },
  ];

  function toUrlString(input) {
    if (typeof input === "string") return input;
    return input?.url || input?.href || "";
  }

  function matchKind(input) {
    const url = toUrlString(input);
    const rule = CAPTURE_RULES.find((r) => url.includes(r.path));
    return rule ? { kind: rule.kind, url } : null;
  }

  function emitCapture(kind, url, data) {
    window.postMessage({ type: "EXT_PRODUCT_CAPTURE", kind, url, data }, "*");
  }

  const origFetch = window.fetch;
  window.fetch = async function (...args) {
    const response = await origFetch.apply(this, args);
    const match = matchKind(args[0]);
    if (match) {
      response
        .clone()
        .json()
        .then((data) => emitCapture(match.kind, match.url, data))
        .catch(() => {});
    }
    return response;
  };

  const origOpen = XMLHttpRequest.prototype.open;
  const origSend = XMLHttpRequest.prototype.send;

  XMLHttpRequest.prototype.open = function (method, url, ...rest) {
    this._extProductUrl = url;
    return origOpen.call(this, method, url, ...rest);
  };

  XMLHttpRequest.prototype.send = function (...args) {
    const match = matchKind(this._extProductUrl);
    if (match) {
      this.addEventListener("load", function () {
        try {
          emitCapture(match.kind, match.url, JSON.parse(this.responseText));
        } catch {
          /* ignore */
        }
      });
    }
    return origSend.apply(this, args);
  };

  // Fallback: content script asks the page to call the API itself (goes through the hook above)
  window.addEventListener("message", (event) => {
    if (event.source !== window) return;
    if (event.data?.type !== "EXT_PRODUCT_FETCH" || !event.data.url) return;

    window
      .fetch(event.data.url, {
        credentials: "include",
        headers: {
          accept: "application/json, text/plain, */*",
          "x-requested-with": "XMLHttpRequest",
        },
      })
      .catch(() => {});
  });
})();
