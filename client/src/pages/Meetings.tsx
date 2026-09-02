import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../lib/api.js";
import { SkeletonList } from "../components/Skeleton.js";
import { EmptyState } from "../components/EmptyState.js";
import { Pagination } from "../components/Pagination.js";

interface MeetingRow {
  id: string;
  title: string;
  startTime: string | null;
  status: string;
  needsResolution: boolean;
  account: { name: string } | null;
}
interface MeetingsPage { items: MeetingRow[]; total: number; page: number; pageSize: number }

const STATUS_CLASS: Record<string, string> = {
  COMPLETED: "ok",
  AWAITING_APPROVAL: "warn",
  DRAFT_READY: "warn",
  FAILED: "err",
};

const ALL_STATUSES = [
  "CAPTURED", "WAITING_FOR_TRANSCRIPT", "TRANSCRIPT_READY", "PROCESSING", "EXTRACTED",
  "DRAFT_READY", "AWAITING_APPROVAL", "APPROVED", "SENDING", "COMPLETED", "FAILED",
];

const PAGE_SIZE = 25;

export default function Meetings() {
  const [result, setResult] = useState<MeetingsPage | null>(null);
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState(""); // debounced value actually sent to the server
  const [statusFilter, setStatusFilter] = useState("");
  const [page, setPage] = useState(1);

  // Debounce the search box so every keystroke doesn't fire a request.
  useEffect(() => {
    const t = setTimeout(() => setSearch(searchInput.trim()), 300);
    return () => clearTimeout(t);
  }, [searchInput]);

  useEffect(() => setPage(1), [search, statusFilter]);

  useEffect(() => {
    const params = new URLSearchParams({ page: String(page), pageSize: String(PAGE_SIZE) });
    if (search) params.set("search", search);
    if (statusFilter) params.set("status", statusFilter);
    setResult(null);
    api<MeetingsPage>(`/meetings?${params}`).then(setResult);
  }, [search, statusFilter, page]);

  const isFiltering = !!search || !!statusFilter;

  return (
    <div>
      <h1>Meetings</h1>
      <div className="card">
        <div style={{ display: "flex", gap: "0.5rem", marginBottom: "0.75rem" }}>
          <input placeholder="Search by title or account…" value={searchInput} onChange={(e) => setSearchInput(e.target.value)} style={{ flex: "2 1 220px", marginBottom: 0 }} />
          <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} style={{ flex: "1 1 160px", marginBottom: 0 }}>
            <option value="">All statuses</option>
            {ALL_STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>

        {result === null ? (
          <SkeletonList rows={4} />
        ) : result.items.length === 0 ? (
          isFiltering ? (
            <p className="muted">No meetings match your filters.</p>
          ) : (
            <EmptyState
              icon="calendar"
              title="No meetings yet"
              description="Connect Zoom and end a recorded meeting — it'll show up here once the transcript is processed."
            />
          )
        ) : (
          <>
            <table>
              <thead>
                <tr>
                  <th>Meeting</th>
                  <th>Account</th>
                  <th>Date</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {result.items.map((m) => (
                  <tr key={m.id}>
                    <td><Link to={`/meetings/${m.id}`}>{m.title}</Link></td>
                    <td>{m.account?.name ?? (m.needsResolution ? <span className="badge warn">needs resolution</span> : <span className="muted">—</span>)}</td>
                    <td className="muted">{m.startTime ? new Date(m.startTime).toLocaleString() : "—"}</td>
                    <td><span className={`badge ${STATUS_CLASS[m.status] ?? ""}`}>{m.status}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
            <Pagination page={result.page} pageSize={result.pageSize} total={result.total} onPageChange={setPage} />
          </>
        )}
      </div>
    </div>
  );
}
