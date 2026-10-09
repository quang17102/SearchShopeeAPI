const capturedByKind = new Map();
const captureWaiters = [];

function isOkCapture(capture) {
  const data = capture.data;
  if (!data || typeof data !== "object") return false;
  if (data.code != null && data.code !== 0) return false;
  if (data.error != null && data.error !== 0) return false;
  return true;
}

function captureMatches(capture, kind, urlIncludes, requireOk) {
  if (capture.kind !== kind) return false;
  if (urlIncludes && !capture.url.includes(urlIncludes)) return false;
  return !requireOk || isOkCapture(capture);
}

function findCapture(kind, urlIncludes, requireOk) {
  const list = capturedByKind.get(kind) || [];
  for (let i = list.length - 1; i >= 0; i--) {
    if (captureMatches(list[i], kind, urlIncludes, requireOk)) return list[i];
  }
  return null;
}

function waitForCapture(kind, urlIncludes, timeout, requireOk = true) {
  const existing = findCapture(kind, urlIncludes, requireOk);
  if (existing) return Promise.resolve(existing);

  return new Promise((resolve) => {
    const waiter = { kind, urlIncludes, requireOk, resolve };
    captureWaiters.push(waiter);
    setTimeout(() => {
      const idx = captureWaiters.indexOf(waiter);
      if (idx === -1) return;
      captureWaiters.splice(idx, 1);
      resolve(null);
    }, timeout);
  });
}

window.addEventListener("message", (event) => {
  if (event.source !== window) return;
  if (event.data?.type !== "EXT_PRODUCT_CAPTURE") return;

  const capture = {
    kind: event.data.kind,
    url: String(event.data.url || ""),
    data: event.data.data,
  };

  if (!capturedByKind.has(capture.kind)) capturedByKind.set(capture.kind, []);
  capturedByKind.get(capture.kind).push(capture);

  for (let i = captureWaiters.length - 1; i >= 0; i--) {
    const waiter = captureWaiters[i];
    if (!captureMatches(capture, waiter.kind, waiter.urlIncludes, waiter.requireOk)) continue;
    captureWaiters.splice(i, 1);
    waiter.resolve(capture);
  }
});

const FALLBACK_FETCH_ATTEMPTS = 2;

async function getProductCapture({ kind, urlIncludes, timeout, fallbackFetchUrl, waitForOk }) {
  // waitForOk: bo qua response loi, cho response OK den het timeout
  let capture =
    findCapture(kind, urlIncludes, true) ||
    (await waitForCapture(kind, urlIncludes, timeout, Boolean(waitForOk))) ||
    findCapture(kind, urlIncludes, false);

  // Trang khong goi API hoac API tra loi (vd code=599) -> tu goi lai
  for (
    let i = 0;
    !(capture && isOkCapture(capture)) && fallbackFetchUrl && i < FALLBACK_FETCH_ATTEMPTS;
    i++
  ) {
    const next = waitForCapture(kind, urlIncludes, 8000, true);
    window.postMessage({ type: "EXT_PRODUCT_FETCH", url: fallbackFetchUrl }, "*");
    capture = (await next) || capture;
  }

  // Co the van la response loi -> background bao loi chi tiet
  return capture;
}

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg.action !== "product_capture_get") return;

  getProductCapture(msg)
    .then((capture) =>
      sendResponse(
        capture
          ? { ok: true, data: capture.data, url: capture.url }
          : { ok: false, error: `Không bắt được API ${msg.kind}` }
      )
    )
    .catch((e) => sendResponse({ ok: false, error: e.message }));

  return true;
});
