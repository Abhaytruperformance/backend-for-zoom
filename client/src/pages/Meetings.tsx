import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../lib/api.js";
import { SkeletonList } from "../components/Skeleton.js";
import { EmptyState } from "../components/EmptyState.js";

interface MeetingRow {
  id: string;
  title: string;
  startTime: string | null;
  status: string;
  needsResolution: boolean;
  account: { name: string } | null;
}

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

export default function Meetings() {
  const [meetings, setMeetings] = useState<MeetingRow[] | null>(null);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");

  useEffect(() => {
    api<MeetingRow[]>("/meetings").then(setMeetings);
  }, []);

  const filtered = useMemo(() => {
    if (!meetings) return null;
    const q = search.trim().toLowerCase();
    return meetings.filter((m) => {
      const matchesSearch = !q || m.title.toLowerCase().includes(q) || m.account?.name.toLowerCase().includes(q);
      const matchesStatus = !statusFilter || m.status === statusFilter;
      return matchesSearch && matchesStatus;
    });
  }, [meetings, search, statusFilter]);

  return (
    <div>
      <h1>Meetings</h1>
      {meetings === null ? (
        <SkeletonList rows={4} />
      ) : meetings.length === 0 ? (
        <EmptyState
          icon="📅"
          title="No meetings yet"
          description="Connect Zoom and end a recorded meeting — it'll show up here once the transcript is processed."
        />
      ) : (
        <div className="card">
          <div style={{ display: "flex", gap: "0.5rem", marginBottom: "0.75rem" }}>
            <input placeholder="Search by title or account…" value={search} onChange={(e) => setSearch(e.target.value)} style={{ flex: "2 1 220px", marginBottom: 0 }} />
            <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} style={{ flex: "1 1 160px", marginBottom: 0 }}>
              <option value="">All statuses</option>
              {ALL_STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
          {filtered && filtered.length === 0 ? (
            <p className="muted">No meetings match your filters.</p>
          ) : (
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
                {filtered?.map((m) => (
                  <tr key={m.id}>
                    <td><Link to={`/meetings/${m.id}`}>{m.title}</Link></td>
                    <td>{m.account?.name ?? (m.needsResolution ? <span className="badge warn">needs resolution</span> : <span className="muted">—</span>)}</td>
                    <td className="muted">{m.startTime ? new Date(m.startTime).toLocaleString() : "—"}</td>
                    <td><span className={`badge ${STATUS_CLASS[m.status] ?? ""}`}>{m.status}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}
    </div>
  );
}
