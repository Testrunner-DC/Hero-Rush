/**
 * ColumnSelector — compact horizontal button group for grid column count
 *
 * Options: 2 | 4 | 6 | 8 | 10
 * MSA Light Theme, 11px font, compact style.
 * Supports `compact` prop for ultra-compact mode (right panel toolbar).
 */

interface Props {
  columns: number;
  onChange: (n: number) => void;
  /** Even more compact for right panel toolbar */
  compact?: boolean;
}

const COLUMN_OPTIONS = [2, 4, 6, 8, 10] as const;

export default function ColumnSelector({ columns, onChange, compact = false }: Props) {
  return (
    <div className={`inline-flex items-center gap-0.5 bg-stone-100 rounded p-0.5 ${compact ? "scale-90 origin-right" : ""}`}>
      {COLUMN_OPTIONS.map((n) => (
        <button
          key={n}
          onClick={() => onChange(n)}
          className={`rounded font-medium leading-tight transition ${
            compact ? "px-1.5 py-0.5 text-[10px]" : "px-2 py-0.5 text-[11px]"
          } ${
            columns === n
              ? "bg-msa-600 text-white shadow-sm"
              : "text-stone-500 hover:text-stone-700 hover:bg-stone-200"
          }`}
        >
          {n}
        </button>
      ))}
    </div>
  );
}
