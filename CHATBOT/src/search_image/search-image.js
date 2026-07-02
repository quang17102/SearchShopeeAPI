import { writeFileSync } from "fs";

import { MAX_PRODUCTS, PRODUCT_URLS_FILE, RESULT_FILE, USER_AGENT, loadCookie } from "./config.js";

const API_URL = "https://affiliate.shopee.vn/api/v3/gql/?q=searchProductOfferByImage";

const SEARCH_QUERY = `
query SearchProductOfferByImageQuery($affiliateMeta: NewOfferResolverAffiliateMetaInput, $entrance: ImgSearchEntrance, $filter: FilterInput, $imageBox: [Int!], $imageKey: String, $matchType: MatchTypeInput, $page: NewOfferResolverPaginationInput, $sortType: ProductListSortType, $trace: String) {
  searchProductOfferByImage(
    affiliateMeta: $affiliateMeta
    entrance: $entrance
    filter: $filter
    imageBox: $imageBox
    imageKey: $imageKey
    matchType: $matchType
    page: $page
    sortType: $sortType
    trace: $trace
  ) {
    multiImageBoxes {
      boxPos
      boxScore
    }
    offers {
      amsPeriodEndTime
      batchItemForItemCardFull
      brandCommissionStatus
      defaultCommissionRate
      invitedCampaignOfferCard {
        campaignStatus
        commissionId
        freeSample
        higherCommission
        periodStartTime
        products {
          amsPeriodEndTime
          brandCommissionStatus
          defaultCommissionRate
          isFreeGiftItem
          isFreeSample
          isNewUserDeal
          isRefundableSample
          isSellerInvited
          itemId
          itemVideoInfo {
            itemId
            similarVideoNum
          }
          longLink
          lowerSellerCommissionRateInfo {
            brandCommissionRateDecreaseTo
            commissionId
            commissionVersion
            defaultCommissionRateDecreaseTo
            effectiveStartTime
            platformCommissionId
            platformCommissionRate
            platformCommissionVersion
          }
          maxCommissionRate
          myCollectionLink
          myCollectionLinkId
          myCollectionLinkImage
          myCollectionLinkName
          offerCardType
          productLink
          promotionVouchers {
            discount {
              discountCap
              discountType
              discountValue
              discountValueSpecialDisplay
            }
            minimumBasketSize
            tcLinkSignature
            validEndTime
            validStartTime
            voucherChannel
            voucherCode
            voucherId
            voucherType
          }
          ratingStar
          sellerCommissionId
          sellerCommissionProtectionInfo {
            commissionId
            commissionVersion
            defaultCommissionRate
            protectionEndTime
          }
          sellerCommissionRate
          sellerCommissionVersion
          shopId
          sold
        }
        shopCommissionRate
        shopId
        uiType
      }
      isFreeGiftItem
      isFreeSample
      isNewUserDeal
      isRefundableSample
      isSellerInvited
      itemId
      itemVideoInfo {
        itemId
        similarVideoNum
      }
      longLink
      lowerSellerCommissionRateInfo {
        brandCommissionRateDecreaseTo
        commissionId
        commissionVersion
        defaultCommissionRateDecreaseTo
        effectiveStartTime
        platformCommissionId
        platformCommissionRate
        platformCommissionVersion
      }
      maxCommissionRate
      myCollectionLink
      myCollectionLinkId
      myCollectionLinkImage
      myCollectionLinkName
      offerCardType
      productLink
      promotionVouchers {
        discount {
          discountCap
          discountType
          discountValue
          discountValueSpecialDisplay
        }
        minimumBasketSize
        tcLinkSignature
        validEndTime
        validStartTime
        voucherChannel
        voucherCode
        voucherId
        voucherType
      }
      ratingStar
      sellerCommissionId
      sellerCommissionProtectionInfo {
        commissionId
        commissionVersion
        defaultCommissionRate
        protectionEndTime
      }
      sellerCommissionRate
      sellerCommissionVersion
      shopId
      sold
      trace
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
`;

function parseCsrfToken(cookie) {
  const match = cookie.match(/(?:^|;\s*)csrftoken=([^;]+)/i);
  return match ? match[1].trim() : "";
}

function buildHeaders(cookie) {
  const headers = {
    accept: "application/json",
    "accept-language": "vi-VN,vi;q=0.9,en-US;q=0.6,en;q=0.5",
    "af-ac-enc-dat": "b",
    "content-type": "application/json",
    origin: "https://affiliate.shopee.vn",
    priority: "u=1, i",
    referer: "https://affiliate.shopee.vn/dashboard",
    "sec-ch-ua": '"Chromium";v="142", "Google Chrome";v="142", "Not_A Brand";v="99"',
    "sec-ch-ua-mobile": "?0",
    "sec-ch-ua-platform": '"Windows"',
    "sec-fetch-dest": "empty",
    "sec-fetch-mode": "cors",
    "sec-fetch-site": "same-origin",
    "user-agent": USER_AGENT,
    "x-requested-with": "XMLHttpRequest",
    "x-sz-sdk-version": "1.12.21",
    cookie,
  };

  const csrf = parseCsrfToken(cookie);
  if (csrf) headers["x-csrftoken"] = csrf;

  return headers;
}

function assertSearchResponse(data) {
  if (data?.error) {
    throw new Error(`Affiliate search lỗi: ${data.error}`);
  }
  if (data?.errors?.length) {
    throw new Error(data.errors[0]?.message || "GraphQL error");
  }
  if (!data?.data?.searchProductOfferByImage) {
    throw new Error("Affiliate search không trả dữ liệu hợp lệ");
  }
}

function buildPayload(imageKey, offset = 0, limit = 20) {
  return {
    query: SEARCH_QUERY,
    variables: {
      imageKey,
      sortType: "RELEVANCE_DESC",
      page: {
        limit: String(limit),
        offset: String(offset),
      },
      entrance: "AN_ENTRANCE_GALLERY",
    },
    operationName: "SearchProductOfferByImageQuery",
  };
}

export async function searchByImage(imageKey, offset = 0, limit = 20, cookieOpts) {
  const cookie = await loadCookie(cookieOpts);
  const response = await fetch(API_URL, {
    method: "POST",
    headers: buildHeaders(cookie),
    body: JSON.stringify(buildPayload(imageKey, offset, limit)),
  });

  const text = await response.text();
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error(`Response không phải JSON: ${text.slice(0, 200)}`);
  }

  assertSearchResponse(data);
  return data;
}

export function saveResult(data, resultFile = RESULT_FILE) {
  writeFileSync(resultFile, JSON.stringify(data, null, 2), "utf-8");
}

export function extractProductUrls(data, maxCount = MAX_PRODUCTS) {
  const offers = data?.data?.searchProductOfferByImage?.offers ?? [];
  const urls = [];
  const seen = new Set();

  for (const offer of offers) {
    const shopId = offer.shopId ?? offer.batchItemForItemCardFull?.shopid;
    const itemId = offer.itemId ?? offer.batchItemForItemCardFull?.itemid;
    if (!shopId || !itemId) continue;

    const url = `https://shopee.vn/product/${shopId}/${itemId}`;
    if (seen.has(url)) continue;

    seen.add(url);
    urls.push(url);
    if (urls.length >= maxCount) break;
  }

  return urls;
}

export async function searchProductUrls(imageKey, maxCount = MAX_PRODUCTS, cookieOpts) {
  const urls = [];
  const seen = new Set();
  let offset = 0;

  while (urls.length < maxCount) {
    const limit = Math.min(maxCount - urls.length, 50);
    const data = await searchByImage(imageKey, offset, limit, cookieOpts);
    const offers = data?.data?.searchProductOfferByImage?.offers ?? [];

    if (offers.length === 0) break;

    for (const offer of offers) {
      const shopId = offer.shopId ?? offer.batchItemForItemCardFull?.shopid;
      const itemId = offer.itemId ?? offer.batchItemForItemCardFull?.itemid;
      if (!shopId || !itemId) continue;

      const url = `https://shopee.vn/product/${shopId}/${itemId}`;
      if (seen.has(url)) continue;

      seen.add(url);
      urls.push(url);
      if (urls.length >= maxCount) break;
    }

    const page = data?.data?.searchProductOfferByImage?.page;
    if (!page?.hasMore || urls.length >= maxCount) break;
    offset += offers.length;
  }

  return urls.slice(0, maxCount);
}

export function saveProductUrls(urls, resultFile = PRODUCT_URLS_FILE) {
  writeFileSync(resultFile, `${urls.join("\n")}\n`, "utf-8");
}

export function printProductUrls(urls) {
  console.log(urls.join("\n"));
}

const isMain =
  process.argv[1] &&
  import.meta.url === new URL(process.argv[1], "file:").href;

if (isMain) {
  const [, , imageKey, offsetArg, limitArg] = process.argv;

  if (!imageKey) {
    console.log("Cách dùng: node search-image.js <imageKey> [offset] [limit]");
    console.log("Ví dụ:     node search-image.js vn-11134294-81ztc-mpspnedtm7eo2e 0 20");
    process.exit(1);
  }

  const offset = offsetArg ? Number(offsetArg) : 0;
  const limit = limitArg ? Number(limitArg) : MAX_PRODUCTS;

  const data = await searchByImage(imageKey, offset, limit);
  const urls = extractProductUrls(data, MAX_PRODUCTS);
  printProductUrls(urls);
  saveProductUrls(urls);
  console.log(`\nĐã lưu ${urls.length} link vào product_urls.txt`);
}
