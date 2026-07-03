let pendingCaptchaResolve = null;
let pendingCaptchaTimeout = null;

function injectCaptchaScript() {
  const script = document.createElement("script");
  script.src = chrome.runtime.getURL("inject-captcha.js");
  script.onload = () => script.remove();
  (document.head || document.documentElement).appendChild(script);
}

window.addEventListener("message", (event) => {
  if (event.source !== window) return;
  if (event.data?.type !== "CAPTCHA_TEST_RESULT" || !pendingCaptchaResolve) return;

  clearTimeout(pendingCaptchaTimeout);
  const resolve = pendingCaptchaResolve;
  pendingCaptchaResolve = null;
  resolve(event.data);
});

function waitForCaptchaResult(timeout = 30000) {
  return new Promise((resolve, reject) => {
    pendingCaptchaResolve = resolve;
    pendingCaptchaTimeout = setTimeout(() => {
      pendingCaptchaResolve = null;
      reject(new Error("Timeout chờ captcha test"));
    }, timeout);
  });
}

async function runCaptchaTest() {
  const resultPromise = waitForCaptchaResult();
  injectCaptchaScript();
  return resultPromise;
}

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg.action !== "captcha") return;

  runCaptchaTest()
    .then((result) =>
      sendResponse({
        ok: true,
        status: result.status,
        offerCount: result.offers?.length ?? 0,
        page: result.page,
        parseError: result.parseError,
        hasData: Boolean(result.data),
      })
    )
    .catch((e) => sendResponse({ ok: false, error: e.message }));

  return true;
});
