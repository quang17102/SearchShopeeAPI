const capturedByKind = new Map();
const captureWaiters = [];

function captureMatches(capture, kind, urlIncludes) {
  if (capture.kind !== kind) return false;
  return !urlIncludes || capture.url.includes(urlIncludes);
}

function findCapture(kind, urlIncludes) {
  const list = capturedByKind.get(kind) || [];
  for (let i = list.length - 1; i >= 0; i--) {
    if (captureMatches(list[i], kind, urlIncludes)) return list[i];
  }
  return null;
}

function waitForCapture(kind, urlIncludes, timeout) {
  const existing = findCapture(kind, urlIncludes);
  if (existing) return Promise.resolve(existing);

  return new Promise((resolve) => {
    const waiter = { kind, urlIncludes, resolve };
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
    if (!captureMatches(capture, waiter.kind, waiter.urlIncludes)) continue;
    captureWaiters.splice(i, 1);
    waiter.resolve(capture);
  }
});

async function getProductCapture({ kind, urlIncludes, timeout, fallbackFetchUrl }) {
  let capture = await waitForCapture(kind, urlIncludes, timeout);

  if (!capture && fallbackFetchUrl) {
    window.postMessage({ type: "EXT_PRODUCT_FETCH", url: fallbackFetchUrl }, "*");
    capture = await waitForCapture(kind, urlIncludes, 10000);
  }

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
