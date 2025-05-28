# 将节点池订阅链接名称格式化
# 作者：Levi
# 强迫症专属
# 使用方法：搭配rename-subs.yml使用。默认生成文件存放在仓库根目录，初始链接全部放在stored-subs.txt里即可，生成的文件为upgrade-subs.txt。
#!/usr/bin/env python3
# -*- coding: utf-8 -*-
import os
import re
import time
from collections import defaultdict
import requests
from geopy.geocoders import Nominatim
from geopy.extra.rate_limiter import RateLimiter

STORED_FILE  = "stored-subs.txt"
OUTPUT_FILE  = "upgrade-subs.txt"
# 支持的协议列表，如有更多可继续补充
PROTOCOLS = ["vmess", "ss", "ssr", "trojan", "vless", "socks5", "shadowsocks", "hy", "hy2", "hysteria", "hysteria2", "snell", "wireguard", "https", "http"]

# 初始化 Nominatim
geolocator = Nominatim(user_agent="normalize_nodes")
geocode = RateLimiter(geolocator.geocode, min_delay_seconds=1)

# 将 ISO2 转为国旗
def flag_from_iso2(iso2: str) -> str:
    return ''.join(chr(ord(ch) + 127397) for ch in iso2.upper())

# 按协议切分订阅条目
def fetch_raw_entries(url: str) -> list[str]:
    r = requests.get(url)
    r.raise_for_status()
    text = r.text.replace('\r', '')
    proto_pattern = r'(?=(?:' + '|'.join(PROTOCOLS) + r')://)'
    parts = re.split(proto_pattern, text, flags=re.IGNORECASE)
    return [p.strip() for p in parts if p.strip()]

# 地名解析 -> 返回 country, iso2, region
def parse_location(name: str):
    loc = geocode(name, language='en')
    if not loc or not loc.raw.get('address'):
        return None, None, None
    addr = loc.raw['address']
    country    = addr.get('country')
    iso2       = addr.get('country_code', '').upper()
    region     = addr.get('state') or addr.get('province') or addr.get('region')
    return country, iso2, region

# 规范化名称
def normalize_names(old_names: list[str]) -> dict[str, str]:
    country_cnt   = defaultdict(int)
    region_cnt    = defaultdict(int)
    mapping       = {}

    for orig in old_names:
        country, iso2, region = parse_location(orig)
        # 如果解析失败
        if not country or not iso2:
            country = 'Other'
            iso2    = None
            region  = None

        if iso2:
            flag = flag_from_iso2(iso2)
            if region:
                key = f"{country}-{region}"
                region_cnt[key] += 1
                seq = f"{region_cnt[key]:04d}"
                new = f"{flag}-{country}-{region}-{seq}"
            else:
                country_cnt[country] += 1
                seq = f"{country_cnt[country]:04d}"
                new = f"{flag}-{country}-{seq}"
        else:
            country_cnt['Other'] += 1
            seq = f"{country_cnt['Other']:04d}"
            new = f"🌐-Other-{seq}"

        mapping[orig] = new
    return mapping

if __name__ == '__main__':
    # 1. 读取 URL 列表
    with open(STORED_FILE, encoding='utf-8') as f:
        urls = [l.strip() for l in f if l.strip()]

    # 2. 拉取并去重
    entries = []
    for url in urls:
        entries.extend(fetch_raw_entries(url))
    seen = set(); unique = []
    for e in entries:
        if e not in seen:
            seen.add(e); unique.append(e)

    # 3. 提取旧名称
    prefixes, old_names = [], []
    for ent in unique:
        if '#' in ent:
            pre, old = ent.rsplit('#', 1)
        else:
            pre, old = ent, ent
        prefixes.append(pre)
        old_names.append(old)

    # 4. 规范化名称
    name_map = normalize_names(old_names)

    # 5. 输出完整订阅行
    with open(OUTPUT_FILE, 'w', encoding='utf-8') as fw:
        for pre, old in zip(prefixes, old_names):
            fw.write(f"{pre}#{name_map[old]}\n")
    print(f"✅ Generated {OUTPUT_FILE} with {len(name_map)} entries.")
