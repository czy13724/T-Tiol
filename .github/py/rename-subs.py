# 将节点池订阅链接名称格式化
# 作者：Levi
# 强迫症专属
# 使用方法：搭配rename-subs.yml使用。默认生成文件存放在仓库根目录，初始链接全部放在stored-subs.txt里即可，生成的文件为upgrade-subs.txt。
#!/usr/bin/env python3
# -*- coding: utf-8 -*-
import os
import zipfile
import requests
from collections import defaultdict
import geopandas as gpd
import pycountry
import re

# 自然地理数据存放路径 数据目录和Natural Earth 下载链接
DATA_DIR      = "natural_earth"
NE_ADMIN0_URL = "https://www.naturalearthdata.com/http//www.naturalearthdata.com/download/10m/cultural/10m_cultural.zip"
NE_ADMIN1_URL = "https://www.naturalearthdata.com/http//www.naturalearthdata.com/download/10m/cultural/10m_cultural.zip"

STORED_FILE  = "stored-subs.txt"
OUTPUT_FILE  = "upgrade-subs.txt"
# 支持的协议列表，如有更多可继续补充
PROTOCOLS = ["vmess", "ss", "ssr", "trojan", "vless", "socks5", "shadowsocks", "hy", "hy2", "hysteria", "hysteria2", "snell", "wireguard", "https", "http"]


def download_and_unzip(url: str, extract_to: str):
    """下载并解压 zip 文件到指定目录（已存在则跳过下载）。"""
    os.makedirs(extract_to, exist_ok=True)
    local_zip = os.path.join(extract_to, os.path.basename(url))
    if not os.path.exists(local_zip):
        print(f"Downloading {url} …")
        r = requests.get(url)
        r.raise_for_status()
        with open(local_zip, "wb") as f:
            f.write(r.content)
    with zipfile.ZipFile(local_zip, "r") as z:
        z.extractall(extract_to)


def load_ne_layers():
    """加载 Natural Earth Admin0/1 数据。"""
    download_and_unzip(NE_ADMIN0_URL, DATA_DIR)
    download_and_unzip(NE_ADMIN1_URL, DATA_DIR)
    admin0_shp = next(fp for fp in os.listdir(DATA_DIR) if fp.endswith("ne_10m_admin_0_countries.shp"))
    admin1_shp = next(fp for fp in os.listdir(DATA_DIR) if fp.endswith("ne_10m_admin_1_states_provinces.shp"))
    gdf0 = gpd.read_file(os.path.join(DATA_DIR, admin0_shp))
    gdf1 = gpd.read_file(os.path.join(DATA_DIR, admin1_shp))
    return gdf0, gdf1


def build_country_map(ne_gdf0):
    """构建国家映射：key 为小写 NAME_EN/ISO_A3，value 为 (emoji_flag, NAME_EN)"""
    cmap = {}
    for _, row in ne_gdf0.iterrows():
        iso2 = row["ISO_A2"]
        flag = "".join(chr(ord(ch) + 127397) for ch in iso2)
        name = row["NAME_EN"]
        cmap[name.lower()] = (flag, name)
        cmap[row["ISO_A3"].lower()] = (flag, name)
    return cmap


def build_subregion_map(ne_gdf1):
    """构建子区域映射：key 为小写 NAME_EN，value 为 (emoji_flag, COUNTRY_NAME, NAME_EN)"""
    smap = {}
    for _, row in ne_gdf1.iterrows():
        iso2 = row["iso_a2"]
        parent = row["admin"]
        flag = "".join(chr(ord(ch) + 127397) for ch in iso2)
        region = row["name"]
        smap[region.lower()] = (flag, parent, region)
    return smap


def fetch_raw_entries(url: str) -> list[str]:
    """按协议名:// 切分并返回非空 subscription entry 列表。"""
    r = requests.get(url)
    r.raise_for_status()
    text = r.text.replace('\r', '')
    proto_pattern = r'(?=(?:' + '|'.join(PROTOCOLS) + r')://)'
    parts = re.split(proto_pattern, text, flags=re.IGNORECASE)
    return [p.strip() for p in parts if p.strip()]


def normalize_names(old_names, country_map, sub_map):
    """对每个旧名称生成新的 flag-country[-region]-xxxx 名称。"""
    c_cnt = defaultdict(int)
    s_cnt = defaultdict(int)
    m = {}
    for orig in old_names:
        key = orig.lower()
        # 子区域优先
        for kw, (f, country, region) in sub_map.items():
            if kw in key:
                grp = f"{country}-{region}"
                s_cnt[grp] += 1
                m[orig] = f"{f}-{country}-{region}-{s_cnt[grp]:04d}"
                break
        else:
            # 再匹配国家
            for kw, (f, country) in country_map.items():
                if kw in key:
                    c_cnt[country] += 1
                    m[orig] = f"{f}-{country}-{c_cnt[country]:04d}"
                    break
            else:
                # 兜底 Other
                c_cnt["Other"] += 1
                m[orig] = f"🌐-Other-{c_cnt['Other']:04d}"
    return m


def main():
    # 加载地图数据
    ne0, ne1 = load_ne_layers()
    country_map = build_country_map(ne0)
    subregion_map = build_subregion_map(ne1)

    # 读取 URL 列表
    with open(STORED_FILE, encoding="utf-8") as f:
        urls = [l.strip() for l in f if l.strip()]

    # 按协议分割并去重
    raw_entries = []
    for url in urls:
        raw_entries.extend(fetch_raw_entries(url))
    seen = set(); unique = []
    for e in raw_entries:
        if e not in seen:
            seen.add(e); unique.append(e)

    # 提取新的名称映射
    prefixes, old_names = [], []
    for ent in unique:
        if '#' in ent:
            pre, old = ent.rsplit('#', 1)
        else:
            pre, old = ent, ent
        prefixes.append(pre)
        old_names.append(old)

    name_map = normalize_names(old_names, country_map, subregion_map)

    # 写入输出
    with open(OUTPUT_FILE, "w", encoding="utf-8") as fw:
        for pre, old in zip(prefixes, old_names):
            fw.write(f"{pre}#{name_map[old]}\n")
    print(f"✅ Generated {OUTPUT_FILE} with {len(name_map)} entries.")

if __name__ == "__main__":
    main()
