(function () {
  if (window.__extImageSearchHookInstalled) {
    window.postMessage({ type: "IMAGE_SEARCH_READY" }, "*");
    return;
  }
  window.__extImageSearchHookInstalled = true;

  const MAX_PRODUCTS = 50;
  let running = false;

  function base64ToBlob(base64, mime) {
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return new Blob([bytes], { type: mime || "image/jpeg" });
  }

  async function uploadImage(blob, filename) {
    const formData = new FormData();
    formData.append("file", blob, filename || "photo.jpg");

    const res = await fetch("/api/v3/upload/image/", {
      method: "POST",
      credentials: "include",
      headers: {
        accept: "application/json, text/plain, */*",
        "x-requested-with": "XMLHttpRequest",
      },
      body: formData,
    });

    const data = await res.json();
    if (!res.ok || data.code !== 0) {
      throw new Error(`Upload ảnh thất bại: ${data.msg ?? res.status}`);
    }

    const payload = data.data;
    const raw =
      typeof payload === "string"
        ? payload
        : payload?.imageKey || payload?.image_key || payload?.key || payload?.url;

    const match = String(raw || "").match(/vn-\d+-[\w-]+/);
    if (!match) throw new Error("Không lấy được imageKey từ response upload");
    return match[0];
  }

  async function searchByImageKey(imageKey, offset, limit) {
    const res = await fetch("/api/v3/gql/?q=searchProductOfferByImage", {
      method: "POST",
      credentials: "include",
      headers: {
        accept: "application/json",
        "content-type": "application/json",
        "af-ac-enc-dat": "b",
        "x-requested-with": "XMLHttpRequest",
        "x-sz-sdk-version": "1.12.21",
      },
      body: JSON.stringify({
        query: `
          query SearchProductOfferByImageQuery(
            $imageKey: String,
            $page: NewOfferResolverPaginationInput,
            $sortType: ProductListSortType,
            $entrance: ImgSearchEntrance
          ) {
            searchProductOfferByImage(
              imageKey: $imageKey
              page: $page
              sortType: $sortType
              entrance: $entrance
            ) {
              offers { itemId shopId productLink }
              page { hasMore limit offset totalCount }
            }
          }
        `,
        variables: {
          imageKey,
          sortType: "RELEVANCE_DESC",
          page: { limit: String(limit), offset: String(offset) },
          entrance: "AN_ENTRANCE_GALLERY",
        },
        operationName: "SearchProductOfferByImageQuery",
      }),
    });

    const text = await res.text();
    let data;
    try {
      data = JSON.parse(text);
    } catch {
      throw new Error(`Response search ảnh không phải JSON: ${text.slice(0, 200)}`);
    }

    if (data?.errors?.length) {
      throw new Error(data.errors[0]?.message || "GraphQL error");
    }
    if (!data?.data?.searchProductOfferByImage) {
      throw new Error("Search ảnh không trả dữ liệu hợp lệ");
    }

    return data.data.searchProductOfferByImage;
  }

  async function collectProductUrls(imageKey) {
    const urls = [];
    const seen = new Set();
    let offset = 0;

    while (urls.length < MAX_PRODUCTS) {
      const limit = Math.min(MAX_PRODUCTS - urls.length, 50);
      const result = await searchByImageKey(imageKey, offset, limit);
      const offers = result.offers || [];
      if (!offers.length) break;

      for (const offer of offers) {
        if (!offer.shopId || !offer.itemId) continue;
        const url = `https://shopee.vn/product/${offer.shopId}/${offer.itemId}`;
        if (seen.has(url)) continue;
        seen.add(url);
        urls.push(url);
        if (urls.length >= MAX_PRODUCTS) break;
      }

      if (!result.page?.hasMore || urls.length >= MAX_PRODUCTS) break;
      offset += offers.length;
    }

    return urls;
  }

  async function runImageSearch(imageBase64, filename, mime) {
    const blob = base64ToBlob(imageBase64, mime);
    const imageKey = await uploadImage(blob, filename);
    const urls = await collectProductUrls(imageKey);

    if (!urls.length) {
      throw new Error("Không tìm thấy sản phẩm nào");
    }

    return { ok: true, urls };
  }

  window.addEventListener("message", (event) => {
    if (event.source !== window) return;
    if (event.data?.type !== "IMAGE_SEARCH_RUN") return;
    if (running) return;

    running = true;
    runImageSearch(event.data.imageBase64, event.data.filename, event.data.mime)
      .catch((e) => ({ ok: false, error: e.message || String(e) }))
      .then((result) => {
        window.postMessage({ type: "IMAGE_SEARCH_RESULT", ...result }, "*");
      })
      .finally(() => {
        running = false;
      });
  });

  window.postMessage({ type: "IMAGE_SEARCH_READY" }, "*");
})();
