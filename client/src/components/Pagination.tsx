export function Pagination({
  page,
  pageSize,
  total,
  onPageChange,
}: {
  page: number;
  pageSize: number;
  total: number;
  onPageChange: (page: number) => void;
}) {
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  if (totalPages <= 1) return null;

  const start = (page - 1) * pageSize + 1;
  const end = Math.min(page * pageSize, total);

  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: "1rem", paddingTop: "1rem", borderTop: "1px solid var(--border)" }}>
      <span className="muted" style={{ fontSize: "var(--text-caption)" }}>
        {start}–{end} of {total}
      </span>
      <div style={{ display: "flex", gap: "0.5rem" }}>
        <button onClick={() => onPageChange(page - 1)} disabled={page <= 1}>Previous</button>
        <button onClick={() => onPageChange(page + 1)} disabled={page >= totalPages}>Next</button>
      </div>
    </div>
  );
}
