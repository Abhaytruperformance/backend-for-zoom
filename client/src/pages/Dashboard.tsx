import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../lib/api.js";
import { SkeletonList } from "../components/Skeleton.js";
import { EmptyState } from "../components/EmptyState.js";
import { toast } from "../lib/toast.js";

interface MeetingRow {
  id: string;
  title: string;
  status: string;
  updatedAt: string;
  account: { name: string } | null;
}
interface MeetingsPage { items: MeetingRow[]; total: number }
interface NeedsResolutionMeeting { id: string; title: string; startTime: string | null }
interface ActionItemRow {
  id: string;
  description: string;
  ownerDisplayName: string;
  dueDate: string | null;
  meetingId: string;
  accountId: string | null;
}
interface ActionItemsPage { items: ActionItemRow[]; total: number }

function agingBadge(updatedAt: string) {
  const hours = (Date.now() - new Date(updatedAt).getTime()) / (1000 * 60 * 60);
  if (hours < 24) return null;
  const days = Math.floor(hours / 24);
  return <span className={`badge ${hours >= 72 ? "err" : "warn"}`}>waiting {days}d</span>;
}

export default function Dashboard() {
  const [awaitingApproval, setAwaitingApproval] = useState<MeetingsPage | null>(null);
  const [failed, setFailed] = useState<MeetingsPage | null>(null);
  const [needsResolution, setNeedsResolution] = useState<NeedsResolutionMeeting[]>([]);
  const [openActions, setOpenActions] = useState<ActionItemsPage | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkOwner, setBulkOwner] = useState("");
  const [bulkBusy, setBulkBusy] = useState(false);

  function loadActions() {
    api<ActionItemsPage>("/actions?status=OPEN&pageSize=100").then(setOpenActions);
  }

  useEffect(() => {
    api<MeetingsPage>("/meetings?status=AWAITING_APPROVAL&pageSize=50").then(setAwaitingApproval);
    api<MeetingsPage>("/meetings?status=FAILED&pageSize=50").then(setFailed);
    api<NeedsResolutionMeeting[]>("/accounts/needs-resolution").then(setNeedsResolution);
    loadActions();
  }, []);

  const staleApprovals = (awaitingApproval?.items ?? []).filter((m) => Date.now() - new Date(m.updatedAt).getTime() > 24 * 60 * 60 * 1000);

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleAll() {
    if (!openActions) return;
    setSelected((prev) => (prev.size === openActions.items.length ? new Set() : new Set(openActions.items.map((a) => a.id))));
  }

  async function bulkComplete() {
    setBulkBusy(true);
    try {
      await api("/actions/bulk", { method: "PATCH", body: JSON.stringify({ ids: [...selected], status: "COMPLETED" }) });
      toast(`Marked ${selected.size} action item${selected.size > 1 ? "s" : ""} complete`);
      setSelected(new Set());
      loadActions();
    } catch (err) {
      toast(err instanceof Error ? err.message : "Bulk update failed", "err");
    } finally {
      setBulkBusy(false);
    }
  }

  async function bulkReassign() {
    if (!bulkOwner.trim()) return;
    setBulkBusy(true);
    try {
      await api("/actions/bulk", { method: "PATCH", body: JSON.stringify({ ids: [...selected], ownerDisplayName: bulkOwner.trim() }) });
      toast(`Reassigned ${selected.size} action item${selected.size > 1 ? "s" : ""} to ${bulkOwner.trim()}`);
      setSelected(new Set());
      setBulkOwner("");
      loadActions();
    } catch (err) {
      toast(err instanceof Error ? err.message : "Bulk update failed", "err");
    } finally {
      setBulkBusy(false);
    }
  }

  return (
    <div>
      <h1>Dashboard</h1>
      <p className="muted">What needs your attention right now.</p>

      <div className="stat-row">
        <div className="stat-card">
          <div className={`stat-value ${(awaitingApproval?.total ?? 0) > 0 ? "warn" : ""}`}>{awaitingApproval === null ? "—" : awaitingApproval.total}</div>
          <div className="stat-label">Awaiting approval</div>
        </div>
        <div className="stat-card">
          <div className={`stat-value ${needsResolution.length > 0 ? "warn" : ""}`}>{needsResolution.length}</div>
          <div className="stat-label">Need resolution</div>
        </div>
        <div className="stat-card">
          <div className={`stat-value ${(failed?.total ?? 0) > 0 ? "err" : ""}`}>{failed === null ? "—" : failed.total}</div>
          <div className="stat-label">Failed</div>
        </div>
        <div className="stat-card">
          <div className="stat-value">{openActions === null ? "—" : openActions.total}</div>
          <div className="stat-label">Open action items</div>
        </div>
      </div>

      {staleApprovals.length > 0 && (
        <div className="card" style={{ borderColor: "var(--warn-tint)", background: "var(--warn-tint)" }}>
          <p style={{ margin: 0 }}>
            <strong>{staleApprovals.length}</strong> draft{staleApprovals.length > 1 ? "s have" : " has"} been waiting on your approval for over a day.
          </p>
        </div>
      )}

      <div className="card">
        <h3>Awaiting your approval</h3>
        {awaitingApproval === null ? (
          <SkeletonList rows={2} />
        ) : awaitingApproval.items.length === 0 ? (
          <p className="muted">Nothing waiting on you.</p>
        ) : (
          <ul className="plain">
            {awaitingApproval.items.map((m) => (
              <li key={m.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span>
                  <Link to={`/meetings/${m.id}/approval`}>{m.title}</Link>
                  {m.account && <span className="muted"> · {m.account.name}</span>}
                </span>
                {agingBadge(m.updatedAt)}
              </li>
            ))}
          </ul>
        )}
      </div>

      {needsResolution.length > 0 && (
        <div className="card">
          <h3>Needs account resolution</h3>
          <ul className="plain">
            {needsResolution.map((m) => (
              <li key={m.id}><Link to="/accounts">{m.title}</Link></li>
            ))}
          </ul>
        </div>
      )}

      {failed !== null && failed.items.length > 0 && (
        <div className="card">
          <h3>Failed</h3>
          <ul className="plain">
            {failed.items.map((m) => (
              <li key={m.id}><Link to={`/meetings/${m.id}`}>{m.title}</Link> <span className="badge err">FAILED</span></li>
            ))}
          </ul>
        </div>
      )}

      <div className="card">
        <h3>Open action items across all accounts</h3>
        {openActions === null ? (
          <SkeletonList rows={3} />
        ) : openActions.items.length === 0 ? (
          <EmptyState icon="check-circle" title="Nothing open" description="Every action item across your accounts is resolved." />
        ) : (
          <>
            {selected.size > 0 && (
              <div style={{ display: "flex", gap: "0.5rem", alignItems: "center", flexWrap: "wrap", marginBottom: "0.75rem", padding: "0.6rem 0.75rem", background: "var(--accent-tint)", borderRadius: "var(--radius-sm)" }}>
                <strong style={{ fontSize: "var(--text-caption)" }}>{selected.size} selected</strong>
                <button onClick={bulkComplete} disabled={bulkBusy}>Mark complete</button>
                <input placeholder="Reassign to…" value={bulkOwner} onChange={(e) => setBulkOwner(e.target.value)} style={{ width: 160, marginBottom: 0 }} />
                <button onClick={bulkReassign} disabled={bulkBusy || !bulkOwner.trim()}>Reassign</button>
                <button onClick={() => setSelected(new Set())} disabled={bulkBusy}>Clear</button>
              </div>
            )}
            <table>
              <thead>
                <tr>
                  <th style={{ width: 32 }}><input type="checkbox" checked={selected.size === openActions.items.length} onChange={toggleAll} /></th>
                  <th>Action</th>
                  <th>Owner</th>
                  <th>Due</th>
                </tr>
              </thead>
              <tbody>
                {openActions.items.map((a) => (
                  <tr key={a.id}>
                    <td><input type="checkbox" checked={selected.has(a.id)} onChange={() => toggle(a.id)} /></td>
                    <td><Link to={`/meetings/${a.meetingId}`}>{a.description}</Link></td>
                    <td>{a.ownerDisplayName}</td>
                    <td className="muted">{a.dueDate ? new Date(a.dueDate).toLocaleDateString() : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {openActions.total > openActions.items.length && (
              <p className="muted" style={{ marginTop: "0.75rem", marginBottom: 0, fontSize: "var(--text-caption)" }}>
                Showing {openActions.items.length} of {openActions.total} open action items.
              </p>
            )}
          </>
        )}
      </div>
    </div>
  );
}
