(function () {
  if (window.__extCaptchaRunning) return;
  window.__extCaptchaRunning = true;

  (async () => {
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
            imageKey: $imageKey,
            page: $page,
            sortType: $sortType,
            entrance: $entrance
          ) {
            offers {
              itemId
              shopId
              productLink
              longLink
              sold
              ratingStar
              sellerCommissionRate
            }
            page {
              hasMore
              limit
              offset
              totalCount
            }
            trace
          }
        }
      `,
        variables: {
          imageKey: "vn-11134294-81ztc-mpspnedtm7eo2e",
          sortType: "RELEVANCE_DESC",
          page: {
            limit: "20",
            offset: "0",
          },
          entrance: "AN_ENTRANCE_GALLERY",
        },
        operationName: "SearchProductOfferByImageQuery",
      }),
    });

    const text = await res.text();

    console.log("[ExtSearch Captcha] Status:", res.status);
    console.log("[ExtSearch Captcha] Raw response:", text);

    let data = null;
    let parseError = null;

    try {
      data = JSON.parse(text);
      console.log("[ExtSearch Captcha] JSON:", data);

      const result = data?.data?.searchProductOfferByImage;
      console.log("[ExtSearch Captcha] Offers:", result?.offers || []);
      console.log("[ExtSearch Captcha] Page:", result?.page || null);

      window.testImageSearchResult = data;
    } catch (e) {
      parseError = e.message || String(e);
      console.error("[ExtSearch Captcha] Không parse được JSON:", e);
    }

    window.postMessage(
      {
        type: "CAPTCHA_TEST_RESULT",
        status: res.status,
        text,
        data,
        parseError,
        offers: data?.data?.searchProductOfferByImage?.offers || [],
        page: data?.data?.searchProductOfferByImage?.page || null,
      },
      "*"
    );
  })().finally(() => {
    window.__extCaptchaRunning = false;
  });
})();
