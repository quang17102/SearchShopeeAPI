let pendingSearchResolve = null;
let pendingSearchTimeout = null;

function injectSearchHook() {
  if (document.documentElement.dataset.extSearchHook) return;
  const script = document.createElement("script");
  script.src = chrome.runtime.getURL("inject-search.js");
  script.onload = () => script.remove();
  (document.head || document.documentElement).appendChild(script);
  document.documentElement.dataset.extSearchHook = "1";
}

window.addEventListener("message", (event) => {
  if (event.source !== window) return;
  if (event.data?.type !== "SEARCH_ITEMS_RESULT" || !pendingSearchResolve) return;

  clearTimeout(pendingSearchTimeout);
  const resolve = pendingSearchResolve;
  pendingSearchResolve = null;
  resolve(event.data.data);
});

function waitForSearchResult(timeout = 20000) {
  return new Promise((resolve, reject) => {
    pendingSearchResolve = resolve;
    pendingSearchTimeout = setTimeout(() => {
      pendingSearchResolve = null;
      reject(new Error("Timeout chờ API search_items"));
    }, timeout);
  });
}

function setNativeInputValue(input, value) {
  const setter = Object.getOwnPropertyDescriptor(
    window.HTMLInputElement.prototype,
    "value"
  ).set;
  setter.call(input, value);
  input.dispatchEvent(new Event("input", { bubbles: true }));
  input.dispatchEvent(new Event("change", { bubbles: true }));
}

function waitForSelector(selector, timeout = 10000) {
  return new Promise((resolve, reject) => {
    const found = document.querySelector(selector);
    if (found) return resolve(found);

    const obs = new MutationObserver(() => {
      const el = document.querySelector(selector);
      if (el) {
        obs.disconnect();
        resolve(el);
      }
    });
    obs.observe(document.documentElement, { childList: true, subtree: true });
    setTimeout(() => {
      obs.disconnect();
      reject(new Error("Không tìm thấy: " + selector));
    }, timeout);
  });
}

function findSearchInput() {
  return (
    document.querySelector("input.shopee-searchbar-input__input") ||
    document.querySelector('input[placeholder*="Freeship"]')
  );
}

function findSearchButton() {
  return (
    document.querySelector("button.shopee-searchbar__search-button") ||
    document.querySelector(".shopee-searchbar__search-button")
  );
}

function parseProducts(apiData) {
  const items = apiData?.items || [];
  return items.map((item) => {
    const basic = item.item_basic || item;
    const priceRaw = basic.price ?? basic.price_min ?? 0;
    const imageId = basic.image || basic.thumb || "";
    return {
      itemId: basic.itemid,
      shopId: basic.shopid,
      name: basic.name || "",
      price: priceRaw / 100000,
      sold: basic.sold ?? basic.historical_sold ?? 0,
      rating: basic.item_rating?.rating_star ?? null,
      url: `https://shopee.vn/product/${basic.shopid}/${basic.itemid}`,
      image: imageId
        ? `https://down-vn.img.susercontent.com/file/${imageId}`
        : "",
    };
  });
}

async function searchShopee(keyword) {
  injectSearchHook();

  const resultPromise = waitForSearchResult();

  const input =
    findSearchInput() ||
    (await waitForSelector("input.shopee-searchbar-input__input"));
  const button =
    findSearchButton() ||
    (await waitForSelector("button.shopee-searchbar__search-button"));

  input.focus();
  setNativeInputValue(input, keyword);

  await new Promise((r) => setTimeout(r, 200));
  button.click();

  const apiData = await resultPromise;
  const products = parseProducts(apiData);

  if (!products.length) {
    throw new Error("API trả về 0 sản phẩm");
  }

  return products;
}

injectSearchHook();

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg.action !== "search") return;

  searchShopee(msg.keyword)
    .then((products) => sendResponse({ ok: true, products }))
    .catch((e) => sendResponse({ ok: false, error: e.message }));

  return true;
});
