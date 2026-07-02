import { existsSync, readFileSync } from "fs";
import { basename } from "path";

import { DEFAULT_IMAGE, USER_AGENT, loadCookie } from "./config.js";

const API_URL = "https://affiliate.shopee.vn/api/v3/upload/image/";

async function postImageUpload(buffer, filename, cookieOpts) {
  const cookie = await loadCookie(cookieOpts);
  const blob = new Blob([buffer], { type: "image/jpeg" });
  const formData = new FormData();
  formData.append("file", blob, filename);

  const response = await fetch(API_URL, {
    method: "POST",
    headers: {
      accept: "application/json, text/plain, */*",
      origin: "https://affiliate.shopee.vn",
      referer: "https://affiliate.shopee.vn/",
      "user-agent": USER_AGENT,
      "x-requested-with": "XMLHttpRequest",
      cookie,
    },
    body: formData,
  });

  const data = await response.json();
  if (!response.ok || data.code !== 0) {
    throw new Error(`Upload thất bại: ${data.msg ?? response.status}`);
  }

  return data;
}

export async function uploadImageBuffer(buffer, filename = "photo.jpg", cookieOpts) {
  return postImageUpload(buffer, filename, cookieOpts);
}

export async function uploadImage(imagePath = DEFAULT_IMAGE, cookieOpts) {
  if (!existsSync(imagePath)) {
    throw new Error(`Không tìm thấy ảnh: ${imagePath}`);
  }

  const buffer = readFileSync(imagePath);
  return postImageUpload(buffer, basename(imagePath), cookieOpts);
}

export function extractImageKey(data) {
  const payload = data.data;

  const raw =
    typeof payload === "string"
      ? payload
      : payload && typeof payload === "object"
        ? payload.imageKey || payload.image_key || payload.key || payload.url
        : null;

  if (!raw) {
    throw new Error(`Không tìm thấy imageKey trong response: ${JSON.stringify(data)}`);
  }

  const match = String(raw).match(/vn-\d+-[\w-]+/);
  return match ? match[0] : String(raw);
}

const isMain =
  process.argv[1] &&
  import.meta.url === new URL(process.argv[1], "file:").href;

if (isMain) {
  const imagePath = process.argv[2] ?? DEFAULT_IMAGE;
  const data = await uploadImage(imagePath);
  const imageKey = extractImageKey(data);
  console.log("\nimageKey:", imageKey);
}
