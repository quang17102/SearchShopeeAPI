let pendingCaptchaResolve = null;
let pendingCaptchaTimeout = null;

function injectCaptchaScript() {
  const script = document.createElement("script");
  script.src = chrome.runtime.getURL("inject-captcha.js");
  script.onload = () => script.remove();
  (document.head || document.documentElement).appendChild(script);
}

let imageSearchReady = false;
let pendingImageSearchResolve = null;
let pendingImageSearchTimeout = null;

function injectImageSearchHook() {
  const script = document.createElement("script");
  script.src = chrome.runtime.getURL("inject-image-search.js");
  script.onload = () => script.remove();
  (document.head || document.documentElement).appendChild(script);
}

function waitForImageSearchReady(timeout = 10000) {
  if (imageSearchReady) return Promise.resolve();

  return new Promise((resolve, reject) => {
    const start = Date.now();
    const timer = setInterval(() => {
      if (imageSearchReady) {
        clearInterval(timer);
        resolve();
        return;
      }
      if (Date.now() - start > timeout) {
        clearInterval(timer);
        reject(new Error("Timeout chờ inject-image-search.js sẵn sàng"));
      }
    }, 100);
  });
}

function waitForImageSearchResult(timeout = 60000) {
  return new Promise((resolve, reject) => {
    pendingImageSearchResolve = resolve;
    pendingImageSearchTimeout = setTimeout(() => {
      pendingImageSearchResolve = null;
      reject(new Error("Timeout chờ kết quả search ảnh"));
    }, timeout);
  });
}

async function runImageSearch(imageBase64, filename, mime) {
  if (!imageSearchReady) injectImageSearchHook();
  await waitForImageSearchReady();

  const resultPromise = waitForImageSearchResult();
  window.postMessage(
    { type: "IMAGE_SEARCH_RUN", imageBase64, filename, mime },
    "*"
  );

  const result = await resultPromise;
  if (!result.ok) throw new Error(result.error || "Search ảnh thất bại");
  return result.urls;
}

window.addEventListener("message", (event) => {
  if (event.source !== window) return;

  if (event.data?.type === "IMAGE_SEARCH_READY") {
    imageSearchReady = true;
    return;
  }

  if (event.data?.type === "CAPTCHA_TEST_RESULT" && pendingCaptchaResolve) {
    clearTimeout(pendingCaptchaTimeout);
    const resolve = pendingCaptchaResolve;
    pendingCaptchaResolve = null;
    resolve(event.data);
    return;
  }

  if (event.data?.type === "IMAGE_SEARCH_RESULT" && pendingImageSearchResolve) {
    clearTimeout(pendingImageSearchTimeout);
    const resolve = pendingImageSearchResolve;
    pendingImageSearchResolve = null;
    resolve(event.data);
  }
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
  if (msg.action === "captcha") {
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
  }

  if (msg.action === "image_search") {
    runImageSearch(msg.imageBase64, msg.filename, msg.mime)
      .then((urls) => sendResponse({ ok: true, urls }))
      .catch((e) => sendResponse({ ok: false, error: e.message }));

    return true;
  }
});
