import { DEFAULT_IMAGE, PRODUCT_URLS_FILE } from "./config.js";
import { printProductUrls, saveProductUrls, searchProductUrls } from "./search-image.js";
import { extractImageKey, uploadImage } from "./upload-image.js";

const imagePath = process.argv[2] ?? DEFAULT_IMAGE;

console.log(`1/2 Upload ảnh: ${imagePath}`);
const uploadData = await uploadImage(imagePath);
const imageKey = extractImageKey(uploadData);
console.log(`   imageKey: ${imageKey}`);

console.log("\n2/2 Tìm kiếm sản phẩm theo ảnh...");
const urls = await searchProductUrls(imageKey);
printProductUrls(urls);
saveProductUrls(urls);
console.log(`\nĐã lưu ${urls.length} link vào ${PRODUCT_URLS_FILE.split(/[/\\]/).pop()}`);
