#!/usr/bin/env python3
"""Process raw card data into clean JSON for the React app.
Keeps ALL variants (282) - does NOT merge by card_no.
Uses local card images from public/cards/ directory.
Fixes:
  - 基地卡 -> 冲击卡
  - 战力 = dp_value * 500 (not *1000)
  - OCR signal_color / feature mappings
"""
import json
import os
import re
import time
import base64
import urllib.request
import urllib.parse

# ── 数据源路径（可通过环境变量 ZHANSHUANG_DIR 覆盖）──
_zhanshuang_dir = os.environ.get(
    "ZHANSHUANG_DIR",
    os.path.join(os.path.expanduser("~"), "WorkBuddy", "zhanshuang")
)
SRC = os.path.join(_zhanshuang_dir, "超英击战_卡牌数据.json")
CARD_IMG_DIR = os.path.join(_zhanshuang_dir, "超英击战_卡图_处理后")

_project_root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DST = os.path.join(_project_root, "public", "cards.json")

# ---------- helpers ----------
def safe_int(v, default=None):
    try:
        return int(v)
    except (TypeError, ValueError):
        return default

def ocr_space_api(image_path, api_key="K87954381888957"):
    """OCR.space Free API - returns recognized text or None."""
    try:
        with open(image_path, "rb") as f:
            img_data = f.read()
        b64 = base64.b64encode(img_data).decode()
        payload = urllib.parse.urlencode({
            "base64Image": "data:image/png;base64," + b64,
            "language": "cht",
            "isOverlayRequired": "false",
            "filetype": "png",
            "OCREngine": "2",
        }).encode()
        req = urllib.request.Request(
            "https://api.ocr.space/parse/image",
            data=payload,
            headers={"apikey": api_key, "Content-Type": "application/x-www-form-urlencoded"},
            method="POST"
        )
        with urllib.request.urlopen(req, timeout=30) as resp:
            result = json.loads(resp.read().decode())
        if result.get("IsErroredOnProcessing"):
            return None
        texts = [x.get("LineText", "") for x in result.get("ParsedResults", [])]
        return "\n".join(texts)
    except Exception as e:
        return None

# ---------- static maps ----------
RARITY_MAP = {
    1:  {"code": "PR",  "cn": "促销",  "color": "#B4B2A9"},
    2:  {"code": "TR",  "cn": "特典",  "color": "#D4A017"},
    3:  {"code": "C",   "cn": "普通",  "color": "#B4B2A9"},
    4:  {"code": "U",   "cn": "优通",  "color": "#7B8FA0"},
    5:  {"code": "R",   "cn": "稀有",  "color": "#B4B2A9"},
    6:  {"code": "M",   "cn": "神话",  "color": "#D4A017"},
    7:  {"code": "SR",  "cn": "罕通",  "color": "#378ADD"},
    8:  {"code": "GR",  "cn": "金稀",  "color": "#D4A017"},
    9:  {"code": "UR",  "cn": "超稀",  "color": "#9D4EDD"},
    10: {"code": "MR",  "cn": "特秀",  "color": "#D4537E"},
    11: {"code": "SEC", "cn": "秘稀",  "color": "#A32D2D"},
}

ATTR_MAP = {
    1: {"name": "红", "color": "#E24B4A", "en": "Red"},
    2: {"name": "黄", "color": "#D4A017", "en": "Yellow"},
    3: {"name": "蓝", "color": "#378ADD", "en": "Blue"},
    4: {"name": "绿", "color": "#639922", "en": "Green"},
    7: {"name": "通用", "color": "#888780", "en": "Neutral"},
}

PKG_MAP = {
    "BP01": "BP01 基础包",
    "SD01": "SD01 英雄",
    "SD02": "SD02 复仇",
    "SD03": "SD03 集结",
    "SD04": "SD04 时空",
    "PB01": "PB01 促销包",
    "TB01": "TB01 预组包",
}

# ---------- feature / signal_color OCR ----------
FEATURE_MAP_FILE = os.path.join(os.path.dirname(DST), "feature_map.json")
SIGNAL_COLOR_MAP_FILE = os.path.join(os.path.dirname(DST), "signal_color_map.json")

def load_map(path):
    if os.path.exists(path):
        with open(path, "r", encoding="utf-8") as f:
            return json.load(f)
    return {}

def save_map(path, m):
    with open(path, "w", encoding="utf-8") as f:
        json.dump(m, f, ensure_ascii=False, indent=2)

def build_feature_signal_maps(raw_cards, sample_max=25):
    """OCR sample cards to build feature & signal_color text mappings."""
    feature_map = load_map(FEATURE_MAP_FILE)
    signal_map  = load_map(SIGNAL_COLOR_MAP_FILE)

    # Collect distinct feature / signal_color values
    features_to_ocr = set()
    signals_to_ocr  = set()
    for c in raw_cards:
        f = c.get("feature")
        s = c.get("signal_color")
        fs = str(f).strip() if f is not None else ""
        ss = str(s).strip() if s is not None else ""
        if fs and fs not in feature_map:
            features_to_ocr.add(fs)
        if ss and ss not in signal_map:
            signals_to_ocr.add(ss)

    print("  Need OCR for %d new features, %d new signals" % (len(features_to_ocr), len(signals_to_ocr)))

    # Pick representative cards for OCR
    ocr_targets = []
    seen_keys = set()
    for c in raw_cards:
        f = c.get("feature")
        s = c.get("signal_color")
        fs = str(f).strip() if f is not None else ""
        ss = str(s).strip() if s is not None else ""
        key = (fs, ss)
        if key in seen_keys:
            continue
        if fs in feature_map and ss in signal_map:
            continue
        seen_keys.add(key)
        no = c["card_no"]
        rarity_code = RARITY_MAP.get(c["rarity"], {}).get("code", "?")
        fname = "%s-%s.png" % (no, rarity_code)
        img_path = os.path.join(CARD_IMG_DIR, fname)
        ocr_targets.append((fs, ss, img_path))
        if len(ocr_targets) >= sample_max:
            break

    print("  Will OCR %d sample cards (rate-limited to ~20/min)..." % len(ocr_targets))

    for (fk, sk, img_path) in ocr_targets:
        if not os.path.exists(img_path):
            print("  [!] Image not found: %s" % img_path)
            continue
        basename = os.path.basename(img_path)
        print("  OCR: %s (feature=%s, signal=%s)..." % (basename, fk, sk), end="", flush=True)
        text = ocr_space_api(img_path)
        if not text:
            print(" FAILED (skip)")
            continue
        print(" OK")

        # Save raw OCR for manual review
        ocr_debug_dir = os.path.join(os.path.dirname(DST), "ocr_debug")
        os.makedirs(ocr_debug_dir, exist_ok=True)
        debug_name = basename.replace(".png", ".txt")
        with open(os.path.join(ocr_debug_dir, debug_name), "w", encoding="utf-8") as f:
            f.write("feature_key=%s\nsignal_key=%s\n\n%s\n" % (fk, sk, text))

        # --- Tentative feature extraction ---
        if fk and fk not in feature_map:
            chi_words = re.findall(r'[\u4e00-\u9fff]{2,6}', text)
            stop_words = set(["攻击", "防御", "战力", "费用", "效果", "出击", "拦截", "连击", "强袭", "空袭", "唯一"])
            candidates = [w for w in chi_words if w not in stop_words]
            if candidates:
                unique = list(dict.fromkeys(candidates))
                feature_map[fk] = "/".join(unique[:3])
                print("    -> feature[%s] tentative: %s" % (fk, feature_map[fk]))
            else:
                feature_map[fk] = fk

        # --- Tentative signal_color extraction ---
        if sk and sk not in signal_map:
            color_words = re.findall(r'(红|蓝|绿|黄|紫|白|黑|橙|灰|彩虹|无)', text)
            if color_words:
                signal_map[sk] = color_words[0]
                print("    -> signal[%s] tentative: %s" % (sk, signal_map[sk]))
            else:
                signal_map[sk] = sk

        time.sleep(3)  # Rate limit for free OCR.space

    save_map(FEATURE_MAP_FILE, feature_map)
    save_map(SIGNAL_COLOR_MAP_FILE, signal_map)
    return feature_map, signal_map

def resolve_feature(feature_str, feature_map):
    """Convert '1,2' -> '人类/复仇者联盟' using feature_map."""
    if not feature_str:
        return None
    parts = feature_str.split(",")
    names = [feature_map.get(p.strip(), p.strip()) for p in parts if p.strip()]
    if names:
        return "/".join(names)
    return feature_str

def get_pkg_short(card_no):
    prefix = card_no[:4]
    return PKG_MAP.get(prefix, prefix)

def build_maps_from_files():
    """Load pre-built feature / signal_color maps from JSON files."""
    feature_map = load_map(FEATURE_MAP_FILE)
    signal_map  = load_map(SIGNAL_COLOR_MAP_FILE)
    print("  Loaded %d feature mappings, %d signal_color mappings" % (len(feature_map), len(signal_map)))
    return feature_map, signal_map

def main():
    with open(SRC, "r", encoding="utf-8") as f:
        raw = json.load(f)

    print("Loading feature / signal_color maps...")
    feature_map, signal_map = build_maps_from_files()
    print("  feature_map entries: %d" % len(feature_map))
    print("  signal_map entries:  %d" % len(signal_map))
    print("  (You can manually edit %s and %s to correct)" % (FEATURE_MAP_FILE, SIGNAL_COLOR_MAP_FILE))

    cards = []
    card_groups = {}

    for c in raw:
        no = c["card_no"]
        rarity = c["rarity"]
        rarity_info = RARITY_MAP.get(rarity, {"code": "?", "cn": "未知", "color": "#888780"})
        rarity_code = rarity_info["code"]
        card_id = "%s-%s" % (no, rarity_code)

        image_url = "/cards/%s-%s.png" % (no, rarity_code)
        # Handle 金/银 variant image suffixes
        if "（金）" in no:
            base_no = no.replace("（金）", "")
            image_url = "/cards/%s-%s(G).png" % (base_no, rarity_code)
        elif "（银）" in no:
            base_no = no.replace("（银）", "")
            image_url = "/cards/%s-%s(S).png" % (base_no, rarity_code)

        dp = safe_int(c.get("dp_value"))
        if dp is not None:
            power = str(dp * 500)
        else:
            power = None

        fk = str(c.get("feature") or "").strip()
        sk_raw = c.get("signal_color")
        if sk_raw is not None:
            sk = str(sk_raw).strip()
        else:
            sk = ""

        card = {
            "id": card_id,
            "card_no": no,
            "name": c["name"],
            "card_type": int(c["card_type"]),
            "card_type_name": "角色卡" if c["card_type"] == "1" else "冲击卡",
            "cost": safe_int(c["cost"]),
            "cost_name": "Lv%d" % safe_int(c["cost"]) if c["card_type"] == "1" else "-",
            "attribute": safe_int(c["attribute"]),
            "attribute_name": ATTR_MAP.get(safe_int(c["attribute"]), {}).get("name", "未知"),
            "attribute_color": ATTR_MAP.get(safe_int(c["attribute"]), {}).get("color", "#888780"),
            "pp_value": safe_int(c.get("pp_value")),
            "dp_value": dp,
            "power": power,
            "signal_color": safe_int(c.get("signal_color")) if c.get("signal_color") is not None else None,
            "signal_color_text": signal_map.get(sk, ""),
            "feature": fk if fk else None,
            "feature_text": resolve_feature(fk, feature_map) if fk else None,
            "effect": c.get("effect") or "",
            "package": get_pkg_short(no),
            "package_short": no[:4],
            "rarity": rarity,
            "rarity_code": rarity_code,
            "rarity_cn": rarity_info["cn"],
            "rarity_color": rarity_info["color"],
            "image_url": image_url,
        }
        cards.append(card)

        if no not in card_groups:
            card_groups[no] = []
        card_groups[no].append(card_id)

    cards.sort(key=lambda c: (c["card_no"], -c["rarity"]))
    for no in card_groups:
        card_groups[no].sort(
            key=lambda cid: -next((c["rarity"] for c in cards if c["id"] == cid), 0)
        )

    unique_nos = len(set(c["card_no"] for c in cards))

    output = {
        "total_cards": unique_nos,
        "total_variants": len(cards),
        "packages": list(PKG_MAP.values()),
        "attributes": {str(k): v for k, v in ATTR_MAP.items()},
        "rarities": {str(k): v for k, v in RARITY_MAP.items()},
        "feature_map": feature_map,
        "signal_color_map": signal_map,
        "cards": cards,
        "card_groups": card_groups,
    }

    os.makedirs(os.path.dirname(DST), exist_ok=True)
    with open(DST, "w", encoding="utf-8") as f:
        json.dump(output, f, ensure_ascii=False, indent=2)

    print("")
    print("Processed %d variants (%d unique cards)" % (len(cards), unique_nos))
    print("Output: %s" % DST)
    print("File size: %d bytes" % os.path.getsize(DST))

if __name__ == "__main__":
    main()
