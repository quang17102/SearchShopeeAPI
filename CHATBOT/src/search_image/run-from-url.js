import { createRequire } from "module";
import { existsSync, readFileSync, writeFileSync, unlink } from "fs";
import { basename, resolve } from "path";
import { tmpdir } from "os";
import { fileURLToPath } from "url";

const require = createRequire(import.meta.url);
const { formatProductLinks, REPLY_HASHTAGS_MSG } = require("../config/constants.js");

import {
  MAX_IMAGE_BYTES,
  MAX_PRODUCTS,
  ZALO_MSG_CHUNK_SIZE,
} from "./config.js";
import { searchProductUrls, saveProductUrls } from "./search-image.js";
import { extractImageKey, uploadImage, uploadImageBuffer } from "./upload-image.js";

const DOWNLOAD_HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/142.0.0.0 Safari/537.36",
  Accept: "image/avif,image/webp,image/apng,image/*,*/*;q=0.8",
};

function buildSuccessResult(urls, imageKey) {
  const linksText = formatProductLinks(urls);
  const linkMessages = urls.length ? splitMessageForZalo(linksText) : [];

  return {
    ok: urls.length > 0,
    status_code: 200,
    imageKey,
    urls,
    count: urls.length,
    hashtagMessage: REPLY_HASHTAGS_MSG,
    linkMessages,
    message: linksText,
    messages: linkMessages,
    error: null,
  };
}

export function splitMessageForZalo(text, chunkSize = ZALO_MSG_CHUNK_SIZE) {
  if (text.length <= chunkSize) return [text];

  const lines = text.split("\n");
  const chunks = [];
  let current = "";

  for (const line of lines) {
    const next = current ? `${current}\n${line}` : line;
    if (next.length > chunkSize && current) {
      chunks.push(current);
      current = line;
    } else {
      current = next;
    }
  }

  if (current) chunks.push(current);
  return chunks;
}

async function downloadImageFromUrl(imageUrl) {
  const response = await fetch(imageUrl, { headers: DOWNLOAD_HEADERS });
  if (!response.ok) {
    throw new Error(`Không tải được ảnh từ Zalo: HTTP ${response.status}`);
  }

  const buffer = Buffer.from(await response.arrayBuffer());
  if (buffer.length > MAX_IMAGE_BYTES) {
    throw new Error("Ảnh lớn hơn 5 MB");
  }

  const contentType = (response.headers.get("content-type") || "").toLowerCase();
  let filename = "zalo_photo.jpg";
  if (contentType.includes("png")) filename = "zalo_photo.png";
  else if (contentType.includes("webp")) filename = "zalo_photo.webp";

  return { buffer, filename };
}

function buildErrorResult(err) {
  const message = err?.message || "Lỗi tìm kiếm ảnh.";
  return {
    ok: false,
    status_code: 0,
    imageKey: null,
    urls: [],
    count: 0,
    message,
    messages: [message],
    error: message,
  };
}

export async function searchImageFromBuffer(buffer, filename, opts = {}) {
  const maxProducts = opts.maxProducts ?? MAX_PRODUCTS;
  const cookieOpts = {
    cookie: opts.cookie,
    cookieFile: opts.cookieFile,
    apiUrl: opts.apiUrl,
  };

  try {
    const uploadData = await uploadImageBuffer(buffer, filename, cookieOpts);
    const imageKey = extractImageKey(uploadData);
    const urls = await searchProductUrls(imageKey, maxProducts, cookieOpts);

    if (opts.saveUrls !== false) {
      saveProductUrls(urls);
    }

    return buildSuccessResult(urls, imageKey);
  } catch (err) {
    return buildErrorResult(err);
  }
}

export async function searchImageFromFile(filePath, opts = {}) {
  const absPath = resolve(filePath);
  if (!existsSync(absPath)) {
    return buildErrorResult(new Error(`Không tìm thấy file: ${absPath}`));
  }

  const buffer = readFileSync(absPath);
  return searchImageFromBuffer(buffer, basename(absPath), opts);
}

export async function searchImageFromUrl(imageUrl, opts = {}) {
  let tempPath = null;

  try {
    const { buffer, filename } = await downloadImageFromUrl(imageUrl);
    tempPath = resolve(tmpdir(), `zalo_img_${Date.now()}_${filename}`);
    writeFileSync(tempPath, buffer);

    return searchImageFromBuffer(buffer, filename, opts);
  } catch (err) {
    return buildErrorResult(err);
  } finally {
    if (tempPath) unlink(tempPath, () => {});
  }
}

const isMain =
  process.argv[1] &&
  resolve(fileURLToPath(import.meta.url)) === resolve(process.argv[1]);

if (isMain) {
  const input = process.argv[2];
  if (!input) {
    console.error("Cách dùng: node src/search_image/run-from-url.js <url_anh|duong_dan_file>");
    process.exit(1);
  }

  const isUrl = /^https?:\/\//i.test(input);
  const runner = isUrl ? searchImageFromUrl(input) : searchImageFromFile(input);

  const result = await runner;
  console.log(JSON.stringify(result, null, 2));
  process.exit(result.ok ? 0 : 1);
}
