const { getCommission } = require("./get_commisson");
const {
  fetchCommissionsParallel,
  fetchXtraUrls,
  logCommissionResults,
} = require("./fetch-commissions");
const { runKeywordSearch } = require("../keyword-search/run-api-search");

const DEFAULT_URL = "https://shopee.vn/product/866913266/25222850044";
const DEFAULT_SEARCH_KEYWORD = "áo nữ";
const DEFAULT_LINK_LIMIT = 10;

function parseArgs(argv) {
  const args = argv.slice(2);
  const urls = [];
  let proxy = null;
  let keyword = null;
  let limit = DEFAULT_LINK_LIMIT;
  let xtraOnly = false;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--proxy" && args[i + 1]) {
      proxy = { http: args[++i], https: args[i] };
      continue;
    }
    if (args[i] === "--search") {
      keyword = args[i + 1] && !args[i + 1].startsWith("-") ? args[++i] : DEFAULT_SEARCH_KEYWORD;
      continue;
    }
    if (args[i] === "--limit" && args[i + 1]) {
      limit = Math.max(1, Number(args[++i]) || DEFAULT_LINK_LIMIT);
      continue;
    }
    if (args[i] === "--xtra") {
      xtraOnly = true;
      continue;
    }
    if (args[i].startsWith("http")) {
      urls.push(args[i]);
    }
  }

  return {
    urls,
    proxy,
    keyword,
    limit,
    xtraOnly,
    useSearch: keyword != null || urls.length === 0,
  };
}

async function fetchSearchUrls(keyword, limit) {
  console.log(`[TEST] Tim kiem "${keyword}" qua APISearch (limit ${limit})...`);
  const result = await runKeywordSearch(keyword);

  if (!result.ok) {
    throw new Error(result.error || "Search that bai");
  }

  const urls = (result.urls || []).slice(0, limit);
  if (!urls.length) {
    throw new Error("Khong tim thay san pham nao");
  }

  console.log(`[TEST] Lay duoc ${urls.length} link\n`);
  return urls;
}

function formatResultItem(item) {
  if (item.error) {
    return { url: item.url, ok: false, error: item.error };
  }
  return {
    url: item.url,
    ok: true,
    isXtra: item.data?.isXtra ?? null,
  };
}

function printSummary(summary) {
  console.log("\n[TEST] ===== KET QUA =====");
  console.log(JSON.stringify(summary, null, 2));
}

async function testSingle(url, proxy) {
  console.log(`\n[TEST] Single — ${url}`);
  console.log(`[TEST] Proxy: ${proxy ? proxy.http : "KiotProxy auto"}\n`);

  const start = Date.now();
  try {
    const data = await getCommission(url, proxy);
    const ms = Date.now() - start;
    const result = data
      ? { url, ok: true, isXtra: data.isXtra, ms }
      : { url, ok: true, isXtra: null, ms };

    printSummary({ mode: "single", results: [result], total: 1, xtra: data?.isXtra ? 1 : 0, ms });
  } catch (err) {
    const ms = Date.now() - start;
    printSummary({
      mode: "single",
      results: [{ url, ok: false, error: err.message, ms }],
      total: 1,
      xtra: 0,
      ms,
    });
  }
}

async function testBatch(urls, proxy, { xtraOnly = false, keyword = null } = {}) {
  console.log(`\n[TEST] Batch — ${urls.length} URL`);
  console.log(`[TEST] Proxy: ${proxy ? proxy.http : "KiotProxy auto"}`);
  console.log(`[TEST] Loc Xtra: ${xtraOnly ? "co" : "khong"}\n`);

  const start = Date.now();

  if (xtraOnly) {
    const { xtraUrls, commissions } = await fetchXtraUrls(urls, proxy);
    logCommissionResults(commissions, keyword || "batch-test");
    const ms = Date.now() - start;
    printSummary({
      mode: "xtra",
      keyword,
      scanned: commissions.length,
      total: urls.length,
      xtra: xtraUrls.length,
      xtraUrls,
      results: commissions.map(formatResultItem),
      ms,
    });
    return;
  }

  const commissions = await fetchCommissionsParallel(urls, proxy);
  logCommissionResults(commissions, keyword || "batch-test");
  const results = commissions.map(formatResultItem);
  const xtraCount = results.filter((r) => r.ok && r.isXtra === true).length;
  const ms = Date.now() - start;

  printSummary({
    mode: "batch",
    keyword,
    total: urls.length,
    xtra: xtraCount,
    results,
    ms,
  });
}

async function main() {
  const { urls, proxy, keyword, limit, xtraOnly, useSearch } = parseArgs(process.argv);

  let testUrls = urls;

  if (useSearch && !urls.length) {
    const searchKeyword = keyword || DEFAULT_SEARCH_KEYWORD;
    testUrls = await fetchSearchUrls(searchKeyword, limit);
    await testBatch(testUrls, proxy, { xtraOnly, keyword: searchKeyword });
    return;
  }

  if (urls.length === 1 && !useSearch) {
    await testSingle(urls[0], proxy);
    return;
  }

  const batchUrls = (urls.length ? urls : [DEFAULT_URL]).slice(0, limit);
  await testBatch(batchUrls, proxy, { xtraOnly, keyword });
}

main().catch((e) => {
  console.error("[TEST] Fatal:", e.message);
  process.exit(1);
});
