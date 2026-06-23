import json

with open('public/cards.json', 'r', encoding='utf-8') as f:
    data = json.load(f)

cards = data.get('cards', [])

# 稀有度数字 → 名称（根据规则书+分布推断）
# 11=MR(1级异画), 10=UR(终极稀有), 9=GR(极稀有), 8=SR(超稀有), 7=R(稀有), 5=C(普通/稀有)
# 用户说：UR×1张, GR×2张, SR×3张, R×3张（倍数）
RARITY_MULTIPLIER = {10: 1, 9: 2, 8: 3, 7: 3, 5: 3}

def get_max_rarity_version(card_list):
    """同card_no取最高稀有度版本"""
    seen = {}
    for c in card_list:
        no = c['card_no']
        if no not in seen or c['rarity'] > seen[no]['rarity']:
            seen[no] = c
    return list(seen.values())

def build_deck_from_prefix(prefix, deck_name):
    """按规律生成50张预组"""
    # 筛选该prefix的角色卡
    sd_cards = [c for c in cards if c['card_no'].startswith(prefix) and c['card_type'] == 1]
    unique = get_max_rarity_version(sd_cards)
    
    # 按稀有度分组，高稀有度优先
    by_rarity = {}
    for c in unique:
        r = c['rarity']
        if r not in by_rarity:
            by_rarity[r] = []
        by_rarity[r].append(c)
    
    # 按稀有度从高到低排序
    sorted_rarities = sorted(by_rarity.keys(), reverse=True)
    
    deck_list = []  # list of card_id
    
    # 第一轮：按倍数放卡
    for r in sorted_rarities:
        mult = RARITY_MULTIPLIER.get(r, 3)
        for c in by_rarity[r]:
            # 放 mult 张，但不超过3张同名
            count = min(mult, 3)
            for _ in range(count):
                deck_list.append(c['id'])
            if len(deck_list) >= 50:
                break
        if len(deck_list) >= 50:
            break
    
    # 如果还不够50张，用R卡补齐（每种最多3张）
    if len(deck_list) < 50:
        for r in sorted_rarities:
            if r in RARITY_MULTIPLIER and RARITY_MULTIPLIER[r] >= 3:
                # 已经是R卡，看还能加多少
                for c in by_rarity[r]:
                    current_count = deck_list.count(c['id'])
                    while current_count < 3 and len(deck_list) < 50:
                        deck_list.append(c['id'])
                        current_count += 1
                    if len(deck_list) >= 50:
                        break
            if len(deck_list) >= 50:
                break
    
    deck_list = deck_list[:50]
    
    # 统计
    print(f'=== {deck_name} 预组 ===')
    print(f'总张数: {len(deck_list)}')
    cnt = {}
    for cid in deck_list:
        cnt[cid] = cnt.get(cid, 0) + 1
    for cid, c in [(c['id'], c) for c in unique]:
        if cid in cnt:
            print(f'  {c["name"]} (rarity={c["rarity"]}): {cnt[cid]}张')
    
    return {
        'name': deck_name,
        'card_type': 1,
        'format': 'standard',
        'cards': deck_list,
        'source': f'预组 {prefix}'
    }

# 生成 SD01 和 SD02 预组
sd01_deck = build_deck_from_prefix('SD01', 'SD01 英雄 预组')
print()
sd02_deck = build_deck_from_prefix('SD02', 'SD02 复仇 预组')

# 保存
with open('public/precon_sd01.json', 'w', encoding='utf-8') as f:
    json.dump(sd01_deck, f, ensure_ascii=False, indent=2)
print('\n已保存 public/precon_sd01.json')

with open('public/precon_sd02.json', 'w', encoding='utf-8') as f:
    json.dump(sd02_deck, f, ensure_ascii=False, indent=2)
print('已保存 public/precon_sd02.json')
