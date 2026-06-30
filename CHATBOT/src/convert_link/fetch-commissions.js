const { getCommission } = require("./get_commisson");

const DEFAULT_CONCURRENCY = 5;
const MAX_XTRA_PRODUCTS = 20;

async function fetchCommissionsParallel(urls, concurrency = DEFAULT_CONCURRENCY) {
  const results = [];

  for (let i = 0; i < urls.length; i += concurrency) {
    const batch = urls.slice(i, i + concurrency);
    const settled = await Promise.allSettled(
      batch.map(async (url) => {
        const data = await getCommission(url);
        return { url, data };
      })
    );

    for (let j = 0; j < settled.length; j++) {
      const item = settled[j];
      if (item.status === "fulfilled") {
        results.push(item.value);
      } else {
        results.push({
          url: batch[j],
          error: item.reason?.message || String(item.reason),
        });
      }
    }
  }

  return results;
}

async function fetchXtraUrls(
  urls,
  limit = MAX_XTRA_PRODUCTS,
  concurrency = DEFAULT_CONCURRENCY
) {
  const xtraUrls = [];
  const commissions = [];

  for (let i = 0; i < urls.length; i += concurrency) {
    if (xtraUrls.length >= limit) break;

    const batch = urls.slice(i, i + concurrency);
    const settled = await Promise.allSettled(
      batch.map(async (url) => {
        const data = await getCommission(url);
        return { url, data };
      })
    );

    for (let j = 0; j < settled.length; j++) {
      const item = settled[j];
      const entry =
        item.status === "fulfilled"
          ? item.value
          : { url: batch[j], error: item.reason?.message || String(item.reason) };

      commissions.push(entry);

      if (!entry.error && entry.data?.isXtra === true && xtraUrls.length < limit) {
        xtraUrls.push(entry.url);
      }

      if (xtraUrls.length >= limit) break;
    }

    if (xtraUrls.length >= limit) break;
  }

  return { xtraUrls, commissions };
}

function logCommissionResults(commissions, keyword) {
  const label = keyword ? ` keyword="${keyword}"` : "";
  console.log(`[COMMISSION] Bat dau${label} — ${commissions.length} ket qua`);

  for (const item of commissions) {
    if (item.error) {
      console.log(`[COMMISSION] ERROR ${item.url}: ${item.error}`);
      continue;
    }

    const { url, data } = item;
    if (!data) {
      console.log(`[COMMISSION] ${url} -> khong co du lieu`);
      continue;
    }

    console.log(`[COMMISSION] ${url} -> imageUrl: ${data}`);
  }
}

module.exports = {
  fetchCommissionsParallel,
  fetchXtraUrls,
  logCommissionResults,
  MAX_XTRA_PRODUCTS,
};
