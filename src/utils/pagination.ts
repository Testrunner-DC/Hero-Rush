export const CARD_PAGE_SIZE = 30;

export interface PaginationResult<T> {
  items: T[];
  page: number;
  pageCount: number;
  total: number;
}

export function getPageCount(total: number, pageSize = CARD_PAGE_SIZE): number {
  if (pageSize <= 0) throw new Error("pageSize must be greater than zero");
  return Math.max(1, Math.ceil(Math.max(0, total) / pageSize));
}

export function clampPage(page: number, pageCount: number): number {
  return Math.min(Math.max(1, Math.trunc(page) || 1), Math.max(1, pageCount));
}

export function paginateItems<T>(
  items: readonly T[],
  requestedPage: number,
  pageSize = CARD_PAGE_SIZE,
): PaginationResult<T> {
  const pageCount = getPageCount(items.length, pageSize);
  const page = clampPage(requestedPage, pageCount);
  const start = (page - 1) * pageSize;

  return {
    items: items.slice(start, start + pageSize),
    page,
    pageCount,
    total: items.length,
  };
}
