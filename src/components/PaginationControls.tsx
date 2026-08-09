import { clampPage } from "../utils/pagination";

interface Props {
  page: number;
  pageCount: number;
  total: number;
  pageSize: number;
  onPageChange: (page: number) => void;
}

function visiblePages(page: number, pageCount: number): number[] {
  if (pageCount <= 5) return Array.from({ length: pageCount }, (_, index) => index + 1);
  const start = Math.min(Math.max(1, page - 2), pageCount - 4);
  return Array.from({ length: 5 }, (_, index) => start + index);
}

export default function PaginationControls({
  page,
  pageCount,
  total,
  pageSize,
  onPageChange,
}: Props) {
  if (total <= pageSize) return null;

  const currentPage = clampPage(page, pageCount);
  const start = (currentPage - 1) * pageSize + 1;
  const end = Math.min(currentPage * pageSize, total);

  const changePage = (nextPage: number) => {
    onPageChange(clampPage(nextPage, pageCount));
  };

  return (
    <nav
      className="flex flex-wrap items-center justify-center gap-1.5 py-3"
      aria-label="卡牌分页"
    >
      <span className="mr-2 text-[11px] text-stone-400">
        {start}–{end} / {total}
      </span>
      <button
        type="button"
        onClick={() => changePage(currentPage - 1)}
        disabled={currentPage === 1}
        className="rounded border border-stone-200 bg-white px-2.5 py-1 text-xs text-stone-600 transition hover:border-red-300 hover:text-red-600 disabled:cursor-not-allowed disabled:opacity-40"
      >
        上一页
      </button>
      {visiblePages(currentPage, pageCount).map((pageNumber) => (
        <button
          type="button"
          key={pageNumber}
          onClick={() => changePage(pageNumber)}
          aria-current={pageNumber === currentPage ? "page" : undefined}
          className={`min-w-7 rounded border px-2 py-1 text-xs transition ${
            pageNumber === currentPage
              ? "border-red-500 bg-red-500 text-white"
              : "border-stone-200 bg-white text-stone-600 hover:border-red-300 hover:text-red-600"
          }`}
        >
          {pageNumber}
        </button>
      ))}
      <button
        type="button"
        onClick={() => changePage(currentPage + 1)}
        disabled={currentPage === pageCount}
        className="rounded border border-stone-200 bg-white px-2.5 py-1 text-xs text-stone-600 transition hover:border-red-300 hover:text-red-600 disabled:cursor-not-allowed disabled:opacity-40"
      >
        下一页
      </button>
    </nav>
  );
}
