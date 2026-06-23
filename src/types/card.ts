/** Each variant is a separate card entry with its own image and rarity. */

export interface Card {
  id: string;           // Unique per variant: "BP01-001-MR"
  card_no: string;      // For game logic grouping: "BP01-001"
  name: string;
  card_type: 1 | 2;
  card_type_name: string;
  cost: number;
  cost_name: string;
  attribute: number;
  attribute_name: string;
  attribute_color: string;
  pp_value: number | null;
  dp_value: number | null;
  power: string | null;
  signal_color: number | null;
  signal_color_text: string | null;
  feature: string | null;
  feature_text: string | null;
  effect: string;
  package: string;
  package_short: string;
  rarity: number;
  rarity_code: string;
  rarity_cn: string;
  rarity_color: string;
  image_url: string;    // Local path: "/cards/BP01-001-MR.png"
  /** 基础 R 值（若数据中无此字段，默认为 1） */
  r?: number;
}

export interface CardDatabase {
  total_cards: number;      // 226 unique card_nos
  total_variants: number;   // 282
  packages: string[];
  attributes: Record<string, { name: string; color: string; en: string }>;
  rarities: Record<string, { code: string; cn: string; color: string }>;
  cards: Card[];            // All 282 variants
  card_groups: Record<string, string[]>;  // card_no -> [id1, id2, ...]
}

export interface DeckEntry {
  card_no: string;
  count: number;
}

export interface Deck {
  name: string;
  main_deck: DeckEntry[];
  rush_deck: DeckEntry[];
  created_at: string;
}
