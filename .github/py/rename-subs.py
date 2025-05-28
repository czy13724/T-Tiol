# 将节点池订阅链接名称格式化
# 作者：Levi
# 强迫症专属
# 使用方法：搭配rename-subs.yml使用。默认生成文件存放在仓库根目录，初始链接全部放在stored-subs.txt里即可，生成的文件为upgrade-subs.txt。

import requests
from collections import defaultdict
import pycountry

STORED_FILE = "stored-subs.txt"
OUTPUT_FILE = "upgrade-subs.txt"

def fetch_node_names(url: str) -> list[str]:
    """Fetch each non-empty line from the given URL."""
    r = requests.get(url)
    r.raise_for_status()
    return [line.strip() for line in r.text.splitlines() if line.strip()]

def build_country_map() -> dict[str, tuple[str,str]]:
    """
    Map lowercase country keyword (name or alpha_3) 
    to (emoji_flag, official English country name).
    """
    cmap: dict[str, tuple[str,str]] = {}
    for c in pycountry.countries:
        iso2 = c.alpha_2
        flag = "".join(chr(ord(ch) + 127397) for ch in iso2)
        cmap[c.name.lower()]    = (flag, c.name)
        cmap[c.alpha_3.lower()] = (flag, c.name)
    return cmap

def build_subregion_map() -> dict[str, tuple[str,str,str]]:
    """
    Map lowercase subdivision name 
    to (emoji_flag, country_name, subdivision_name).
    """
    smap: dict[str, tuple[str,str,str]] = {}
    for sub in pycountry.subdivisions:
        parent = pycountry.countries.get(alpha_2=sub.country_code)
        if not parent:
            continue
        iso2 = parent.alpha_2
        flag = "".join(chr(ord(ch) + 127397) for ch in iso2)
        smap[sub.name.lower()] = (flag, parent.name, sub.name)
    return smap

def normalize_names(names: list[str],
                    country_map: dict[str,tuple[str,str]],
                    sub_map: dict[str,tuple[str,str,str]]
                   ) -> dict[str,str]:
    """
    对每个原始名称返回规范化后的新名称。
    1) 先尝试子区域匹配 → flag-country-region-XXXX  
    2) 再尝试国家匹配 → flag-country-XXXX  
    3) 都不匹配 → 🌐-Other-XXXX
    """
    c_cnt = defaultdict(int)
    s_cnt = defaultdict(int)
    out   = {}

    for orig in names:
        key = orig.lower()
        # 1) 子区域优先
        matched = False
        for kw,(f,country,region) in sub_map.items():
            if kw in key:
                grp = f"{country}-{region}"
                s_cnt[grp] += 1
                seq = f"{s_cnt[grp]:04d}"
                out[orig] = f"{f}-{country}-{region}-{seq}"
                matched = True
                break
        if matched:
            continue

        # 2) 国家匹配
        for kw,(f,country) in country_map.items():
            if kw in key:
                c_cnt[country] += 1
                seq = f"{c_cnt[country]:04d}"
                out[orig] = f"{f}-{country}-{seq}"
                matched = True
                break
        if matched:
            continue

        # 3) 兜底“其他”
        c_cnt["Other"] += 1
        seq = f"{c_cnt['Other']:04d}"
        out[orig] = f"🌐-Other-{seq}"

    return out

def main():
    # 读取所有 URL
    with open(STORED_FILE, encoding="utf-8") as f:
        urls = [l.strip() for l in f if l.strip()]

    # 拉取并去重
    all_names = []
    for url in urls:
        all_names.extend(fetch_node_names(url))
    # 如果想按 URL 分组，可在此保留分组信息；这里统一汇总
    unique_names = list(dict.fromkeys(all_names))

    # 构建映射表并规范化
    country_map   = build_country_map()
    subregion_map = build_subregion_map()
    mapping       = normalize_names(unique_names, country_map, subregion_map)

    # 写入输出文件
    with open(OUTPUT_FILE, "w", encoding="utf-8") as fw:
        for old, new in mapping.items():
            fw.write(f"{old} → {new}\n")

    print(f"✅ Generated {OUTPUT_FILE} with {len(mapping)} entries.")

if __name__ == "__main__":
    main()
