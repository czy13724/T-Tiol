# 将节点池订阅链接名称格式化
# 作者：Levi
# 强迫症专属
# 使用方法：搭配rename-subs.yml使用。默认生成文件存放在仓库根目录，初始链接全部放在stored-subs.txt里即可，生成的文件为upgrade-subs.txt。
#!/usr/bin/env python3
# -*- coding: utf-8 -*-

import requests
import re
from collections import defaultdict
import pycountry

STORED_FILE  = "stored-subs.txt"
OUTPUT_FILE  = "upgrade-subs.txt"
# 支持的协议列表，如有更多可继续补充
PROTOCOLS = ["vmess", "ss", "ssr", "trojan", "vless", "socks5", "shadowsocks", "hy", "hy2", "hysteria", "hysteria2", "snell", "https", "http"]

def fetch_raw_entries(url: str) -> list[str]:
    """
    拉取 URL 的原始文本，按协议前缀（协议名://）切分成完整的订阅条目。
    这样即便条目中间有换行，也能保证每个 entry 都是一个完整的字符串。
    """
    r = requests.get(url)
    r.raise_for_status()
    text = r.text.replace('\r', '')  # 统一换行符

    # 构造正则：在任何协议前面切分，保留协议前缀 严格匹配 “协议名://”，只在真正的协议头处分割
    proto_pattern = r'(?=(?:' + '|'.join(PROTOCOLS) + r')://)'
    parts = re.split(proto_pattern, text, flags=re.IGNORECASE)

    # 去除可能的空白，并确保每段以协议开头
    entries = [p.strip() for p in parts if p.strip()]
    return entries

def build_country_map() -> dict[str, tuple[str,str]]:
    cmap = {}
    for c in pycountry.countries:
        flag = "".join(chr(ord(ch) + 127397) for ch in c.alpha_2)
        cmap[c.name.lower()]    = (flag, c.name)
        cmap[c.alpha_3.lower()] = (flag, c.name)
    return cmap

def build_subregion_map() -> dict[str, tuple[str,str,str]]:
    smap = {}
    for sub in pycountry.subdivisions:
        parent = pycountry.countries.get(alpha_2=sub.country_code)
        if not parent: continue
        flag = "".join(chr(ord(ch) + 127397) for ch in parent.alpha_2)
        smap[sub.name.lower()] = (flag, parent.name, sub.name)
    return smap

def normalize_names(old_names: list[str],
                    country_map: dict[str,tuple[str,str]],
                    sub_map: dict[str,tuple[str,str,str]]
                   ) -> dict[str,str]:
    country_cnt   = defaultdict(int)
    subregion_cnt = defaultdict(int)
    mapping = {}

    for orig in old_names:
        key = orig.lower()
        # 1. 子区域优先
        for kw,(f,country,region) in sub_map.items():
            if kw in key:
                grp = f"{country}-{region}"
                subregion_cnt[grp] += 1
                mapping[orig] = f"{f}-{country}-{region}-{subregion_cnt[grp]:04d}"
                break
        else:
            # 2. 再匹配国家
            for kw,(f,country) in country_map.items():
                if kw in key:
                    country_cnt[country] += 1
                    mapping[orig] = f"{f}-{country}-{country_cnt[country]:04d}"
                    break
            else:
                # 3. 都不匹配 → Other
                country_cnt["Other"] += 1
                mapping[orig] = f"🌐-Other-{country_cnt['Other']:04d}"

    return mapping

def main():
    # 1. 读取所有 subscription 链接
    with open(STORED_FILE, encoding="utf-8") as f:
        urls = [l.strip() for l in f if l.strip()]

    # 2. 按协议切分、合并、去重
    raw_entries = []
    for url in urls:
        raw_entries.extend(fetch_raw_entries(url))
    seen = set()
    unique_entries = []
    for e in raw_entries:
        if e not in seen:
            seen.add(e)
            unique_entries.append(e)

    # 3. 提取每条 entry 的「旧名称」
    prefixes = []
    old_names = []
    for entry in unique_entries:
        if "#" in entry:
            pre, old = entry.rsplit("#", 1)
            prefixes.append(pre)
            old_names.append(old)
        else:
            prefixes.append(entry)
            old_names.append(entry)  # 没有 # 的，就当整个 entry 是名称

    # 4. 构建映射表并规范化名称
    country_map   = build_country_map()
    subregion_map = build_subregion_map()
    name_map      = normalize_names(old_names, country_map, subregion_map)

    # 5. 输出到 upgrade-subs.txt
    with open(OUTPUT_FILE, "w", encoding="utf-8") as fw:
        for pre, old in zip(prefixes, old_names):
            new_name = name_map[old]
            fw.write(f"{pre}#{new_name}\n")

    print(f"✅ Generated {OUTPUT_FILE} with {len(name_map)} entries.")

if __name__ == "__main__":
    main()

