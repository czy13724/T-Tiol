# 将节点池订阅链接名称格式化
# 作者：Levi
# 强迫症专属
# 使用方法：搭配rename-subs.yml使用。默认生成文件存放在仓库根目录，初始链接全部放在stored-subs.txt里即可，生成的文件为upgrade-subs.txt。
#!/usr/bin/env python3
# -*- coding: utf-8 -*-

import requests
from collections import defaultdict
import pycountry

STORED_FILE = "stored-subs.txt"
OUTPUT_FILE = "upgrade-subs.txt"

def fetch_lines(url: str) -> list[str]:
    """Fetch each non-empty line from the given URL."""
    r = requests.get(url)
    r.raise_for_status()
    return [line.strip() for line in r.text.splitlines() if line.strip()]

def build_country_map() -> dict[str, tuple[str,str]]:
    cmap: dict[str, tuple[str,str]] = {}
    for c in pycountry.countries:
        flag = "".join(chr(ord(ch) + 127397) for ch in c.alpha_2)
        cmap[c.name.lower()]    = (flag, c.name)
        cmap[c.alpha_3.lower()] = (flag, c.name)
    return cmap

def build_subregion_map() -> dict[str, tuple[str,str,str]]:
    smap: dict[str, tuple[str,str,str]] = {}
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
    """输入旧节点名，输出新节点名（不含订阅前缀）。"""
    country_cnt   = defaultdict(int)
    subregion_cnt = defaultdict(int)
    mapping: dict[str,str] = {}

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
            # 2. 国家匹配
            for kw,(f,country) in country_map.items():
                if kw in key:
                    country_cnt[country] += 1
                    mapping[orig] = f"{f}-{country}-{country_cnt[country]:04d}"
                    break
            else:
                # 3. 兜底“其他”
                country_cnt["Other"] += 1
                mapping[orig] = f"🌐-Other-{country_cnt['Other']:04d}"

    return mapping

def main():
    # 1. 读 URL 列表
    with open(STORED_FILE, encoding="utf-8") as f:
        urls = [l.strip() for l in f if l.strip()]

    # 2. 拉取并去重
    all_lines = []
    for url in urls:
        all_lines.extend(fetch_lines(url))
    unique_lines = list(dict.fromkeys(all_lines))

    # 3. 提取旧节点名（# 之后部分），若无 # 则整个当名
    old_names = []
    for line in unique_lines:
        if '#' in line:
            old_names.append(line.rsplit('#', 1)[1])
        else:
            old_names.append(line)

    # 4. 构建映射表并规范化
    country_map   = build_country_map()
    subregion_map = build_subregion_map()
    name_map      = normalize_names(old_names, country_map, subregion_map)

    # 5. 写入完整订阅行：前缀 + # + 新名称
    with open(OUTPUT_FILE, "w", encoding="utf-8") as fw:
        for line, old in zip(unique_lines, old_names):
            prefix = line.rsplit('#',1)[0] if '#' in line else line
            fw.write(f"{prefix}#{name_map[old]}\n")

    print(f"✅ Generated {OUTPUT_FILE} with {len(name_map)} nodes.")

if __name__ == "__main__":
    main()

