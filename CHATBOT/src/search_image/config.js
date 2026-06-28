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

export const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/142.0.0.0 Safari/537.36";

export function loadCookie(cookieFile = COOKIE_FILE) {
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
