import json
import sys
from pathlib import Path

import requests

URL = "https://shopee-scraper-all-in-one.p.rapidapi.com/search"
RAPIDAPI_HOST = "shopee-scraper-all-in-one.p.rapidapi.com"

CONFIG_FILE = Path(__file__).resolve().parent / "shopee_keyword_search.txt"
CONFIG_EXAMPLE_FILE = Path(__file__).resolve().parent / "shopee_keyword_search.txt.example"


def load_rapidapi_key() -> str:
    if not CONFIG_FILE.is_file():
        hint = CONFIG_EXAMPLE_FILE.name if CONFIG_EXAMPLE_FILE.is_file() else CONFIG_FILE.name
        raise FileNotFoundError(
            f"Khong tim thay {CONFIG_FILE.name}. "
            f"Sao chep tu {hint} va dan RapidAPI key vao file."
        )

    lines = [
        line.strip()
        for line in CONFIG_FILE.read_text(encoding="utf-8").splitlines()
        if line.strip() and not line.strip().startswith("#")
    ]
    if not lines:
        raise ValueError(f"{CONFIG_FILE.name} dang trong.")

    return lines[0]


def build_headers() -> dict[str, str]:
    return {
        "x-rapidapi-key": load_rapidapi_key(),
        "x-rapidapi-host": RAPIDAPI_HOST,
        "Content-Type": "application/json",
        "x-rapidapi-user": "{}",
        "x-rapidapi-subscription": "{}",
        "x-rapidapi-proxy-secret": "{}",
    }


def build_product_link(shop_id: int, item_id: int) -> str:
    return f"https://shopee.vn/product/{shop_id}/{item_id}"


def format_price(price: int | float | None) -> str:
    if price is None:
        return "—"
    return f"{int(price):,}đ".replace(",", ".")


def get_product_url(item: dict) -> str | None:
    url = item.get("url")
    if url:
        return url.replace("&amp;", "&")

    shop_id = item.get("shop_id")
    item_id = item.get("item_id")
    if shop_id and item_id:
        return build_product_link(shop_id, item_id)
    return None


def build_product_entry(item: dict, index: int) -> dict:
    rating = item.get("rating")
    return {
        "index": index,
        "name": item.get("name") or "Khong co ten",
        "price": item.get("price"),
        "price_text": format_price(item.get("price")),
        "rating": rating,
        "rating_text": f"{rating:.1f}" if isinstance(rating, (int, float)) else "—",
        "url": get_product_url(item),
    }


def format_reply_text(result: dict, max_items: int = 20) -> str:
    items = result.get("data") or []
    if not items:
        return "Khong tim thay san pham nao."

    lines = [f"Tim thay {min(len(items), max_items)} san pham:\n"]
    for index, item in enumerate(items[:max_items], start=1):
        entry = build_product_entry(item, index)
        lines.append(f"{index}. {entry['name']}")
        lines.append(f"   Gia: {entry['price_text']} | Danh gia: {entry['rating_text']}")
        if entry["url"]:
            lines.append(f"   {entry['url']}")
        lines.append("")

    return "\n".join(lines).rstrip()


def search_by_keyword(
    keyword: str,
    *,
    country: str = "vn",
    delay: int = 1,
    fetch_detail: bool = False,
    max_products: int = 20,
    sort: str = "sales",
) -> requests.Response:
    payload = {
        "country": country,
        "delay": delay,
        "fetch_detail": fetch_detail,
        "keyword": keyword,
        "max_products": max_products,
        "sort": sort,
    }

    return requests.post(
        URL,
        headers=build_headers(),
        json=payload,
        timeout=120,
    )


def search_key(keyword: str, max_products: int = 20) -> dict:
    try:
        response = search_by_keyword(keyword, max_products=max_products)
    except requests.RequestException as exc:
        return {
            "ok": False,
            "status_code": 0,
            "message": f"Loi ket noi: {exc}",
            "error": str(exc),
        }

    try:
        result = response.json()
    except ValueError:
        return {
            "ok": False,
            "status_code": response.status_code,
            "message": "Phan hoi API khong hop le.",
            "error": response.text[:500],
        }

    ok = response.status_code == 200 and bool(result.get("data"))
    items = result.get("data") or []
    products = [
        build_product_entry(item, index)
        for index, item in enumerate(items[:max_products], start=1)
    ]
    return {
        "ok": ok,
        "status_code": response.status_code,
        "message": format_reply_text(result, max_items=max_products),
        "products": products,
        "error": None if ok else "Khong tim thay san pham nao.",
        "count": result.get("count"),
    }


def print_products(result: dict) -> None:
    print(format_reply_text(result))


def main() -> None:
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8")

    if len(sys.argv) >= 3 and sys.argv[1] == "--json":
        keyword = sys.argv[2]
        max_products = 20
        if len(sys.argv) >= 4:
            max_products = int(sys.argv[3])
        output = search_key(keyword, max_products=max_products)
        print(json.dumps(output, ensure_ascii=False, indent=2))
        sys.exit(0 if output.get("ok") else 1)

    if len(sys.argv) < 2:
        print("Cach dung: python search_key.py <tu_khoa>")
        print("         hoac: python search_key.py --json <tu_khoa> [max_products]")
        print('Vi du: python search_key.py "nuoc rua chen"')
        sys.exit(1)

    keyword = sys.argv[1]
    print(f'Dang tim kiem tu khoa: "{keyword}"')

    try:
        response = search_by_keyword(keyword)
    except FileNotFoundError as exc:
        print(exc)
        sys.exit(1)
    except requests.RequestException as exc:
        print(f"Loi ket noi: {exc}")
        sys.exit(1)

    print(f"Status: {response.status_code}")

    output_path = Path("result_key.json")
    try:
        result = response.json()
        output_path.write_text(
            json.dumps(result, ensure_ascii=False, indent=2),
            encoding="utf-8",
        )
        print(f"Da luu ket qua vao: {output_path.resolve()}")
        print_products(result)
    except ValueError:
        output_path.write_text(response.text, encoding="utf-8")
        print(f"Da luu phan hoi vao: {output_path.resolve()}")


if __name__ == "__main__":
    main()
