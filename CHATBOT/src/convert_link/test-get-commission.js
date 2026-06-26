const { getCommission } = require("./get_commisson");
const {
  fetchCommissionsParallel,
  logCommissionResults,
} = require("./fetch-commissions");

const DEFAULT_URL =
  "https://shopee.vn/product/866913266/25222850044";

function parseArgs(argv) {
  const args = argv.slice(2);
  const urls = [];
  let proxy = null;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--proxy" && args[i + 1]) {
      proxy = { http: args[++i], https: args[i] };
      continue;
    }
    if (args[i].startsWith("http")) {
      urls.push(args[i]);
    }
  }

  return {
    urls: urls.length ? urls : [DEFAULT_URL],
    proxy,
  };
}

async function testSingle(url, proxy) {
  console.log(`\n[TEST] Single — ${url}`);
  console.log(`[TEST] Proxy: ${proxy ? proxy.http : "khong"}\n`);

  const start = Date.now();
  try {
    const data = await getCommission(url, proxy);
    const ms = Date.now() - start;

    if (!data) {
      console.log(`[TEST] Ket qua: null (${ms}ms)`);
      return;
    }

    console.log(`[TEST] OK (${ms}ms)`);
    console.log(JSON.stringify(data, null, 2));
  } catch (err) {
    const ms = Date.now() - start;
    console.error(
      `[TEST] LOI (${ms}ms):`,
      err.response?.status,
      err.response?.data || err.message
    );
  }
}

async function testParallel(urls, proxy) {
  console.log(`\n[TEST] Parallel — ${urls.length} URL`);
  const start = Date.now();
  const results = await fetchCommissionsParallel(urls, proxy);
  logCommissionResults(results, "manual-test");
  console.log(`[TEST] Tong thoi gian: ${Date.now() - start}ms\n`);
}

async function main() {
  const { urls, proxy } = parseArgs(process.argv);

  if (urls.length === 1) {
    await testSingle(urls[0], proxy);
  } else {
    await testParallel(urls, proxy);
  }
}

main().catch((e) => {
  console.error("[TEST] Fatal:", e.message);
  process.exit(1);
});
