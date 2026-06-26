const btn = document.getElementById("btnSearch");
const keywordInput = document.getElementById("keyword");
const statusEl = document.getElementById("status");
const resultsEl = document.getElementById("results");

function formatPrice(price) {
  return new Intl.NumberFormat("vi-VN").format(Math.round(price)) + "₫";
}

function formatSold(sold) {
  if (sold >= 1000) return `Đã bán ${(sold / 1000).toFixed(1)}k`;
  return `Đã bán ${sold}`;
}

function renderProducts(products) {
  if (!products?.length) {
    resultsEl.innerHTML = '<p class="empty-results">Không có sản phẩm</p>';
    return;
  }

  resultsEl.innerHTML = products
    .map((p) => {
      const meta = [
        formatSold(p.sold),
        p.rating != null ? `★ ${p.rating.toFixed(1)}` : null,
      ]
        .filter(Boolean)
        .join(" · ");

      return `
        <a class="product" href="${p.url}" target="_blank" rel="noopener">
          <img src="${p.image}" alt="" loading="lazy">
          <div class="product-info">
            <div class="product-name">${escapeHtml(p.name)}</div>
            <div class="product-price">${formatPrice(p.price)}</div>
            <div class="product-meta">${meta}</div>
          </div>
        </a>
      `;
    })
    .join("");
}

function escapeHtml(text) {
  const div = document.createElement("div");
  div.textContent = text;
  return div.innerHTML;
}

btn.addEventListener("click", async () => {
  const keyword = keywordInput.value.trim();
  if (!keyword) {
    statusEl.textContent = "Nhập từ khóa trước";
    return;
  }

  statusEl.textContent = "Đang search & chờ API...";
  btn.disabled = true;
  resultsEl.innerHTML = "";

  try {
    const res = await chrome.runtime.sendMessage({
      action: "search",
      keyword,
    });

    if (!res?.ok) {
      statusEl.textContent = res?.error || "Lỗi không xác định";
      return;
    }

    renderProducts(res.products);
    statusEl.textContent = `Tìm thấy ${res.products.length} sản phẩm`;
  } catch {
    statusEl.textContent = "Lỗi kết nối background. Reload extension rồi thử lại";
  } finally {
    btn.disabled = false;
  }
});
