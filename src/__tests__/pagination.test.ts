import { describe, expect, it } from "vitest";
import {
  CARD_PAGE_SIZE,
  clampPage,
  getPageCount,
  paginateItems,
} from "../utils/pagination";

describe("card pagination", () => {
  const cards = Array.from({ length: 65 }, (_, index) => index + 1);

  it("uses 30 cards as the shared page size", () => {
    expect(CARD_PAGE_SIZE).toBe(30);
    expect(getPageCount(30)).toBe(1);
    expect(getPageCount(31)).toBe(2);
  });

  it("returns at most 30 items per page", () => {
    expect(paginateItems(cards, 1).items).toEqual(cards.slice(0, 30));
    expect(paginateItems(cards, 2).items).toEqual(cards.slice(30, 60));
    expect(paginateItems(cards, 3).items).toEqual(cards.slice(60));
  });

  it("clamps invalid page numbers", () => {
    expect(clampPage(0, 3)).toBe(1);
    expect(clampPage(99, 3)).toBe(3);
    expect(paginateItems(cards, 99).page).toBe(3);
  });

  it("keeps empty collections on a valid first page", () => {
    expect(paginateItems([], 4)).toEqual({
      items: [],
      page: 1,
      pageCount: 1,
      total: 0,
    });
  });
});
