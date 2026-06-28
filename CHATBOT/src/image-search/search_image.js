const axios = require("axios");
const FormData = require("form-data");
const fs = require("fs");
const path = require("path");
const { LOCSP_API_TOKEN, LOCSP_BASE_URL } = require("../config/constants");

const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const DEFAULT_PAGE_LIMIT = 20;

const DOWNLOAD_HEADERS = {
  "User-Agent": "Mozilla/5.0",
  Accept: "image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8",
  Referer: "https://shopee.vn/",
};

function resolveImageMeta(contentType) {
  const type = String(contentType || "").split(";")[0].trim().toLowerCase();
  if (type === "image/png") return { filename: "photo.png", mime: "image/png" };
  if (type === "image/webp") return { filename: "photo.webp", mime: "image/webp" };
  return { filename: "photo.jpg", mime: "image/jpeg" };
}

function extractApiError(data) {
  if (!data) return "Loi API khong xac dinh";
  if (typeof data === "string") return data.slice(0, 500);
  return data.message || data.error || data.detail || JSON.stringify(data).slice(0, 500);
}

function formatReplyText(items, maxItems = DEFAULT_PAGE_LIMIT) {
  if (!items?.length) return "Khong tim thay san pham nao.";

  const links = items
    .slice(0, maxItems)
    .map((item) => {
      if (item.product_link) return item.product_link;
      if (item.shop_id && item.item_id) {
        return `https://shopee.vn/product/${item.shop_id}/${item.item_id}`;
      }
      return null;
    })
    .filter(Boolean);

  return links.length ? links.join("\n") : "Khong tim thay san pham nao.";
}

async function downloadImage(imageUrl) {
  const res = await axios.get(imageUrl, {
    headers: DOWNLOAD_HEADERS,
    responseType: "arraybuffer",
    timeout: 30000,
    maxContentLength: MAX_IMAGE_BYTES + 1,
    validateStatus: () => true,
  });

  if (res.status !== 200) {
    throw new Error(`Khong tai duoc anh: HTTP ${res.status}`);
  }

  const buffer = Buffer.from(res.data);
  if (buffer.length > MAX_IMAGE_BYTES) {
    throw new Error("Anh lon hon 5 MB");
  }

  return {
    buffer,
    ...resolveImageMeta(res.headers["content-type"]),
  };
}

async function searchByImageBuffer(buffer, filename, mimeType, opts = {}) {
  const form = new FormData();
  form.append("image", buffer, { filename, contentType: mimeType });

  if (opts.imageBox) {
    form.append("image_box", String(opts.imageBox));
  }

  form.append("page_offset", String(opts.pageOffset ?? 0));
  form.append("page_limit", String(opts.pageLimit ?? DEFAULT_PAGE_LIMIT));
  form.append("sort", opts.sort || "relevance");

  try {
    const res = await axios.post(
      `${LOCSP_BASE_URL}/v1/products/search-by-image`,
      form,
      {
        headers: {
          Authorization: `Bearer ${LOCSP_API_TOKEN}`,
          Accept: "application/json",
          ...form.getHeaders(),
        },
        timeout: 60000,
        validateStatus: () => true,
      }
    );

    let data = res.data;
    if (typeof data === "string") {
      try {
        data = JSON.parse(data);
      } catch {
        data = { raw_text: data };
      }
    }

    return { status: res.status, data };
  } catch (err) {
    return {
      status: 0,
      data: { error: err.message || String(err) },
    };
  }
}

async function searchImageFromFile(filePath, opts = {}) {
  const resolved = path.resolve(filePath);
  if (!fs.existsSync(resolved)) {
    return {
      ok: false,
      status_code: 0,
      message: `Khong tim thay file: ${resolved}`,
      error: "FILE_NOT_FOUND",
    };
  }

  const buffer = fs.readFileSync(resolved);
  if (buffer.length > MAX_IMAGE_BYTES) {
    return {
      ok: false,
      status_code: 0,
      message: "Anh lon hon 5 MB",
      error: "FILE_TOO_LARGE",
    };
  }

  const ext = path.extname(resolved).toLowerCase();
  const meta =
    ext === ".png"
      ? { filename: path.basename(resolved), mime: "image/png" }
      : ext === ".webp"
        ? { filename: path.basename(resolved), mime: "image/webp" }
        : { filename: path.basename(resolved), mime: "image/jpeg" };

  const { status, data } = await searchByImageBuffer(
    buffer,
    meta.filename,
    meta.mime,
    opts
  );

  if (status !== 200 || !data || typeof data !== "object") {
    return {
      ok: false,
      status_code: status,
      message: "Loi tim kiem anh.",
      error: extractApiError(data),
    };
  }

  const items = data.items || [];
  return {
    ok: true,
    status_code: status,
    message: formatReplyText(items, opts.pageLimit ?? DEFAULT_PAGE_LIMIT),
    items,
    page: data.page || null,
    error: null,
  };
}

async function searchImageFromUrl(imageUrl, opts = {}) {
  try {
    const { buffer, filename, mime } = await downloadImage(imageUrl);
    const { status, data } = await searchByImageBuffer(buffer, filename, mime, opts);

    if (status !== 200 || !data || typeof data !== "object") {
      return {
        ok: false,
        status_code: status,
        message: "Loi tim kiem anh.",
        error: extractApiError(data),
      };
    }

    const items = data.items || [];
    return {
      ok: true,
      status_code: status,
      message: formatReplyText(items, opts.pageLimit ?? DEFAULT_PAGE_LIMIT),
      items,
      page: data.page || null,
      error: null,
    };
  } catch (err) {
    return {
      ok: false,
      status_code: 0,
      message: `Loi ket noi: ${err.message}`,
      error: err.message,
    };
  }
}

module.exports = {
  searchImageFromUrl,
  searchImageFromFile,
  searchByImageBuffer,
  downloadImage,
  formatReplyText,
};

if (require.main === module) {
  const input = process.argv[2];
  if (!input) {
    console.error("Cach dung: node src/image-search/search_image.js <url_anh|duong_dan_file>");
    process.exit(1);
  }

  const isUrl = /^https?:\/\//i.test(input);
  const runner = isUrl ? searchImageFromUrl(input) : searchImageFromFile(input);

  runner
    .then((result) => {
      console.log(JSON.stringify(result, null, 2));
      process.exit(result.ok ? 0 : 1);
    })
    .catch((err) => {
      console.error(err.message);
      process.exit(1);
    });
}
