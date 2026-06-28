async function runImageSearchFromUrl(imageUrl) {
  const { searchImageFromUrl } = await import("../search_image/run-from-url.js");
  return searchImageFromUrl(imageUrl);
}

module.exports = { runImageSearchFromUrl };
