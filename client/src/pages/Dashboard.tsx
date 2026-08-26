import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../lib/api.js";
import { SkeletonList } from "../components/Skeleton.js";
import { EmptyState } from "../components/EmptyState.js";

interface MeetingRow {
  id: string;
  title: string;
  status: string;
  updatedAt: string;
  account: { name: string } | null;
}
interface NeedsResolutionMeeting { id: string; title: string; startTime: string | null }
interface ActionItemRow {
  id: string;
  description: string;
  ownerDisplayName: string;
  dueDate: string | null;
  meetingId: string;
  accountId: string | null;
}

function agingBadge(updatedAt: string) {
  const hours = (Date.now() - new Date(updatedAt).getTime()) / (1000 * 60 * 60);
  if (hours < 24) return null;
  const days = Math.floor(hours / 24);
  return <span className={`badge ${hours >= 72 ? "err" : "warn"}`}>waiting {days}d</span>;
}

export default function Dashboard() {
  const [meetings, setMeetings] = useState<MeetingRow[] | null>(null);
  const [needsResolution, setNeedsResolution] = useState<NeedsResolutionMeeting[]>([]);
  const [openActions, setOpenActions] = useState<ActionItemRow[] | null>(null);

  useEffect(() => {
    api<MeetingRow[]>("/meetings").then(setMeetings);
    api<NeedsResolutionMeeting[]>("/accounts/needs-resolution").then(setNeedsResolution);
    api<ActionItemRow[]>("/actions?status=OPEN").then(setOpenActions);
  }, []);

  const awaitingApproval = meetings?.filter((m) => m.status === "AWAITING_APPROVAL") ?? [];
  const failed = meetings?.filter((m) => m.status === "FAILED") ?? [];
  const staleApprovals = awaitingApproval.filter((m) => Date.now() - new Date(m.updatedAt).getTime() > 24 * 60 * 60 * 1000);

  return (
    <div>
      <h1>Dashboard</h1>
      <p className="muted">What needs your attention right now.</p>

      <div className="stat-row">
        <div className="stat-card">
          <div className={`stat-value ${awaitingApproval.length > 0 ? "warn" : ""}`}>{meetings === null ? "—" : awaitingApproval.length}</div>
          <div className="stat-label">Awaiting approval</div>
        </div>
        <div className="stat-card">
          <div className={`stat-value ${needsResolution.length > 0 ? "warn" : ""}`}>{needsResolution.length}</div>
          <div className="stat-label">Need resolution</div>
        </div>
        <div className="stat-card">
          <div className={`stat-value ${failed.length > 0 ? "err" : ""}`}>{failed.length}</div>
          <div className="stat-label">Failed</div>
        </div>
        <div className="stat-card">
          <div className="stat-value">{openActions === null ? "—" : openActions.length}</div>
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
        {meetings === null ? (
          <SkeletonList rows={2} />
        ) : awaitingApproval.length === 0 ? (
          <p className="muted">Nothing waiting on you.</p>
        ) : (
          <ul className="plain">
            {awaitingApproval.map((m) => (
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

      {failed.length > 0 && (
        <div className="card">
          <h3>Failed</h3>
          <ul className="plain">
            {failed.map((m) => (
              <li key={m.id}><Link to={`/meetings/${m.id}`}>{m.title}</Link> <span className="badge err">FAILED</span></li>
            ))}
          </ul>
        </div>
      )}

      <div className="card">
        <h3>Open action items across all accounts</h3>
        {openActions === null ? (
          <SkeletonList rows={3} />
        ) : openActions.length === 0 ? (
          <EmptyState icon="check-circle" title="Nothing open" description="Every action item across your accounts is resolved." />
        ) : (
          <table>
            <thead><tr><th>Action</th><th>Owner</th><th>Due</th></tr></thead>
            <tbody>
              {openActions.map((a) => (
                <tr key={a.id}>
                  <td><Link to={`/meetings/${a.meetingId}`}>{a.description}</Link></td>
                  <td>{a.ownerDisplayName}</td>
                  <td className="muted">{a.dueDate ? new Date(a.dueDate).toLocaleDateString() : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
