import { existsSync, readFileSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";

const ROOT = dirname(fileURLToPath(import.meta.url));

export const COOKIE_FILE = join(ROOT, "cookies.txt");
export const DEFAULT_IMAGE = join(ROOT, "28thang6.jpg");
export const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
export const ZALO_MSG_CHUNK_SIZE = 1800;
export const RESULT_FILE = join(ROOT, "search_image_result.json");
export const PRODUCT_URLS_FILE = join(ROOT, "product_urls.txt");
export const MAX_PRODUCTS = 50;
export const DEFAULT_API_SEARCH_URL =
  process.env.API_SEARCH_URL || "http://127.0.0.1:3000";
export const COOKIE_API_TIMEOUT_MS = 5000;

export const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/142.0.0.0 Safari/537.36";

function loadCookieFromFile(cookieFile = COOKIE_FILE) {
  if (!existsSync(cookieFile)) {
    throw new Error(
      `Không tìm thấy file cookie: ${cookieFile}\n` +
        "Hãy đăng nhập https://affiliate.shopee.vn rồi copy cookie vào cookies.txt"
    );
  }

  const cookie = readFileSync(cookieFile, "utf-8").trim();
  if (!cookie || cookie.startsWith("DÁN_COOKIE")) {
    throw new Error(
      `Cookie trong ${cookieFile.split(/[/\\]/).pop()} chưa được cấu hình.\n` +
        "Mở DevTools (F12) → Network → copy header Cookie khi đang ở affiliate.shopee.vn"
    );
  }

  return cookie;
}

async function loadCookieFromApi(apiUrl = DEFAULT_API_SEARCH_URL) {
  const res = await fetch(`${apiUrl}/api/affiliate-cookie`, {
    signal: AbortSignal.timeout(COOKIE_API_TIMEOUT_MS),
  });

  let data;
  try {
    data = await res.json();
  } catch {
    throw new Error(`API cookie trả về không phải JSON (HTTP ${res.status})`);
  }

  if (!res.ok || !data?.cookie) {
    throw new Error(data?.error || `Không lấy được cookie từ API (HTTP ${res.status})`);
  }

  return String(data.cookie).trim();
}

/**
 * @param {string|{ cookie?: string, cookieFile?: string, apiUrl?: string }|undefined} source
 */
export async function loadCookie(source) {
  let cookie;

  if (typeof source === "string") {
    cookie = loadCookieFromFile(source);
  } else {
    const opts = source || {};
    if (opts.cookie) {
      cookie = String(opts.cookie).trim();
    } else if (opts.cookieFile) {
      cookie = loadCookieFromFile(opts.cookieFile);
    } else {
      try {
        cookie = await loadCookieFromApi(opts.apiUrl);
      } catch (apiErr) {
        if (existsSync(COOKIE_FILE)) {
          try {
            cookie = loadCookieFromFile(COOKIE_FILE);
          } catch {
            /* fallback file invalid */
          }
        }

        if (!cookie) {
          throw new Error(
            `${apiErr.message}\n` +
              "Đăng nhập https://affiliate.shopee.vn trên Chrome, bật extension, hoặc cấu hình cookies.txt"
          );
        }
      }
    }
  }

  console.log("[SEARCH_IMAGE] Cookie:", cookie);
  return cookie;
}
