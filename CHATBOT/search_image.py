import hashlib
import json
import re
import sys
import tempfile
import time
import uuid
from pathlib import Path

import requests
from PIL import Image

URL = "https://mall.shopee.vn/api/v4/search/image_search/image_search"

CONFIG_FILE = Path(__file__).resolve().parent / "shopee_image_search.txt"
CONFIG_EXAMPLE_FILE = Path(__file__).resolve().parent / "shopee_image_search.txt.example"


def _parse_cookie_value(cookie: str, name: str) -> str:
    match = re.search(rf"(?:^|;)\s*{re.escape(name)}=([^;]*)", cookie, re.IGNORECASE)
    return match.group(1).strip() if match else ""


def load_shopee_config() -> dict[str, str]:
    if not CONFIG_FILE.is_file():
        hint = CONFIG_EXAMPLE_FILE.name if CONFIG_EXAMPLE_FILE.is_file() else CONFIG_FILE.name
        raise FileNotFoundError(
            f"Khong tim thay {CONFIG_FILE.name}. "
            f"Sao chep tu {hint} va dan chuoi cookie Shopee vao file."
        )

    lines = [
        line.strip()
        for line in CONFIG_FILE.read_text(encoding="utf-8").splitlines()
        if line.strip() and not line.strip().startswith("#")
    ]
    if not lines:
        raise ValueError(f"{CONFIG_FILE.name} dang trong.")

    cookie = lines[0].strip()
    csrf_token = _parse_cookie_value(cookie, "csrftoken")
    af_ac_enc_sz_token = lines[1].strip() if len(lines) > 1 else ""

    if not csrf_token:
        raise ValueError(
            f"Khong tim thay csrftoken trong cookie. "
            f"Kiem tra lai chuoi cookie trong {CONFIG_FILE.name}."
        )

    config = {
        "cookie": cookie,
        "csrf_token": csrf_token,
        "af_ac_enc_sz_token": af_ac_enc_sz_token,
    }
    return config


def build_headers() -> dict[str, str]:
    cfg = load_shopee_config()
    headers = {
        "Accept-Encoding": "gzip, deflate, br",
        "Cache-Control": "no-cache, no-store",
        "Client-Request-Id": f"{uuid.uuid4()}.222",
        "Connection": "Keep-Alive",
        "Cookie": cfg["cookie"],
        "Host": "mall.shopee.vn",
        "Referer": "https://mall.shopee.vn/",
        "SHOPEE_HTTP_DNS_MODE": "1",
        "User-Agent": "Android app Shopee appver=37625 app_type=1 platform=native_android os_ver=30 Cronet/102.0.5005.61",
        "x-api-source": "rn",
        "x-csrftoken": cfg["csrf_token"],
        "x-search-entrance": "SEARCH_RESULT",
        "x-search-image-source": "gallery_panel",
        "X-Shopee-Client-Timezone": "Asia/Ho_Chi_Minh",
    }
    if cfg["af_ac_enc_sz_token"]:
        headers["af-ac-enc-sz-token"] = cfg["af_ac_enc_sz_token"]
    return headers


def compute_image_md5(image_path: Path) -> str:
    md5_hash = hashlib.md5()
    with image_path.open("rb") as f:
        for chunk in iter(lambda: f.read(8192), b""):
            md5_hash.update(chunk)
    return f"imagesearch_{md5_hash.hexdigest()}"


def build_upload_filename(image_path: Path) -> str:
    with Image.open(image_path) as img:
        width, height = img.size
    timestamp_ms = int(time.time() * 1000)
    return f"imagesearch_{timestamp_ms}_{width}x{height}.jpg"


def image_search(image_path: str | Path) -> requests.Response:
    path = Path(image_path)
    if not path.is_file():
        raise FileNotFoundError(f"Khong tim thay file anh: {path}")

    upload_name = build_upload_filename(path)
    md5_value = compute_image_md5(path)

    with path.open("rb") as image_file:
        files = {
            "file": (upload_name, image_file, "image/jpg"),
        }
        data = {
            "md5": md5_value,
            "language": "3",
            "shop_id": "undefined",
            "item_id": "undefined",
            "result_type": "0",
            "offset": "0",
            "limit": "20",
            "athenaCameraParams": "{}",
        }

        response = requests.post(
            URL,
            headers=build_headers(),
            data=data,
            files=files,
            timeout=60,
        )

    return response


def format_price(price: int) -> str:
    return f"{price // 100_000:,}đ".replace(",", ".")


def build_product_link(shopid: int, itemid: int) -> str:
    return f"https://shopee.vn/product/{shopid}/{itemid}"


def format_reply_text(result: dict, max_items: int = 20) -> str:
    if result.get("error"):
        return f"Loi tim kiem anh: {result.get('error_msg', result['error'])}"

    items = result.get("data", {}).get("items", [])
    if not items:
        return "Khong tim thay san pham nao."

    links = []
    for item in items[:max_items]:
        basic = item.get("item_basic", {})
        shopid = basic.get("shopid")
        itemid = basic.get("itemid")
        if shopid and itemid:
            links.append(build_product_link(shopid, itemid))

    return "\n".join(links)


def search_image_from_url(url: str) -> dict:
    tmp_path = None
    try:
        response = requests.get(url, timeout=60)
        response.raise_for_status()

        with tempfile.NamedTemporaryFile(suffix=".jpg", delete=False) as tmp:
            tmp.write(response.content)
            tmp_path = Path(tmp.name)

        api_response = image_search(tmp_path)
        try:
            result = api_response.json()
        except ValueError:
            return {
                "ok": False,
                "status_code": api_response.status_code,
                "message": "Phan hoi API khong hop le.",
                "error": api_response.text[:500],
            }

        ok = api_response.status_code == 200 and not result.get("error")
        return {
            "ok": ok,
            "status_code": api_response.status_code,
            "message": format_reply_text(result),
            "error": result.get("error_msg") if result.get("error") else None,
        }
    except requests.RequestException as exc:
        return {
            "ok": False,
            "status_code": 0,
            "message": f"Loi ket noi: {exc}",
            "error": str(exc),
        }
    finally:
        if tmp_path is not None:
            tmp_path.unlink(missing_ok=True)


def print_products(result: dict) -> None:
    if result.get("error"):
        print(f"Loi API: {result.get('error_msg', result['error'])}")
        return

    items = result.get("data", {}).get("items", [])
    if not items:
        print("Khong tim thay san pham nao.")
        return

    print(f"\nTim thay {len(items)} san pham:\n")
    print("-" * 80)

    for index, item in enumerate(items, start=1):
        basic = item.get("item_basic", {})
        name = basic.get("name", "Khong co ten")
        shopid = basic.get("shopid")
        itemid = basic.get("itemid")
        price = basic.get("price_min") or basic.get("price", 0)
        link = build_product_link(shopid, itemid)

        # print(f"{index}. {name}")
        # print(f"   Gia: {format_price(price)}")
        print(link)
        # print("-" * 80)


def main() -> None:
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8")

    if len(sys.argv) >= 3 and sys.argv[1] == "--json-url":
        url = sys.argv[2]
        output = search_image_from_url(url)
        print(json.dumps(output, ensure_ascii=False))
        sys.exit(0 if output.get("ok") else 1)

    if len(sys.argv) < 2:
        print("Cach dung: python search_image.py <duong_dan_anh>")
        print("         hoac: python search_image.py --json-url <url_anh>")
        print("Vi du: python search_image.py image.jpg")
        sys.exit(1)

    image_path = sys.argv[1]
    print(f"Dang tim kiem bang anh: {image_path}")

    try:
        response = image_search(image_path)
    except FileNotFoundError as exc:
        print(exc)
        sys.exit(1)
    except requests.RequestException as exc:
        print(f"Loi ket noi: {exc}")
        sys.exit(1)

    print(f"Status: {response.status_code}")

    output_path = Path("result.json")
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
