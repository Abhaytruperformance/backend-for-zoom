import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../lib/api.js";
import { SkeletonCards, SkeletonList } from "../components/Skeleton.js";

interface InsightsData {
  meetingsThisMonth: number;
  meetingsLastMonth: number;
  statusBreakdown: Record<string, number>;
  approvalsCount30d: number;
  avgApprovalTurnaroundHours: number | null;
  staleAccounts: Array<{ accountId: string; accountName: string; overdueCount: number }>;
}

// Reuses the app's existing status semantics (same intent as Meetings.tsx's STATUS_CLASS) —
// these are literal meeting statuses, not an arbitrary categorical series, so they borrow the
// reserved good/warning/critical tokens rather than a fresh categorical palette.
const STATUS_COLOR: Record<string, string> = {
  COMPLETED: "var(--ok)",
  FAILED: "var(--danger)",
  AWAITING_APPROVAL: "var(--warn)",
  DRAFT_READY: "var(--warn)",
};
const NEUTRAL_COLOR = "var(--gray-400)";

function formatTurnaround(hours: number | null): string {
  if (hours === null) return "—";
  if (hours < 1) return `${Math.round(hours * 60)}m`;
  if (hours < 48) return `${hours.toFixed(1)}h`;
  return `${(hours / 24).toFixed(1)}d`;
}

function trend(current: number, previous: number): { label: string; className: string } | null {
  if (previous === 0) return null;
  const pct = Math.round(((current - previous) / previous) * 100);
  if (pct === 0) return { label: "flat vs last month", className: "muted" };
  return { label: `${pct > 0 ? "+" : ""}${pct}% vs last month`, className: pct > 0 ? "ok" : "err" };
}

export default function Insights() {
  const [data, setData] = useState<InsightsData | null>(null);

  useEffect(() => {
    api<InsightsData>("/insights").then(setData);
  }, []);

  if (data === null) {
    return (
      <div>
        <h1>Insights</h1>
        <p className="muted">How the pipeline and your team are actually performing.</p>
        <SkeletonCards count={3} />
        <SkeletonList rows={4} />
      </div>
    );
  }

  const statusEntries = Object.entries(data.statusBreakdown).sort((a, b) => b[1] - a[1]);
  const maxCount = Math.max(1, ...statusEntries.map(([, c]) => c));
  const meetingTrend = trend(data.meetingsThisMonth, data.meetingsLastMonth);

  return (
    <div>
      <h1>Insights</h1>
      <p className="muted">How the pipeline and your team are actually performing.</p>

      <div className="stat-row">
        <div className="stat-card">
          <div className="stat-value">{data.meetingsThisMonth}</div>
          <div className="stat-label">Meetings this month</div>
          {meetingTrend && <div className={`badge ${meetingTrend.className}`} style={{ marginTop: "0.4rem" }}>{meetingTrend.label}</div>}
        </div>
        <div className="stat-card">
          <div className="stat-value">{formatTurnaround(data.avgApprovalTurnaroundHours)}</div>
          <div className="stat-label">Avg. approval turnaround</div>
        </div>
        <div className="stat-card">
          <div className="stat-value">{data.approvalsCount30d}</div>
          <div className="stat-label">Approvals, last 30 days</div>
        </div>
        <div className="stat-card">
          <div className={`stat-value ${data.staleAccounts.length > 0 ? "warn" : ""}`}>{data.staleAccounts.length}</div>
          <div className="stat-label">Accounts with overdue items</div>
        </div>
      </div>

      <div className="card">
        <h3>This month's meetings by status</h3>
        {statusEntries.length === 0 ? (
          <p className="muted">No meetings recorded yet this month.</p>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: "0.6rem" }}>
            {statusEntries.map(([status, count]) => (
              <div key={status} title={`${status}: ${count}`} style={{ display: "grid", gridTemplateColumns: "160px 1fr 2.5rem", alignItems: "center", gap: "0.75rem" }}>
                <span style={{ fontSize: "var(--text-caption)", color: "var(--text-muted)" }}>{status.replace(/_/g, " ")}</span>
                <div style={{ height: 10, borderRadius: "var(--radius-pill)", background: "var(--gray-100)", overflow: "hidden" }}>
                  <div
                    style={{
                      height: "100%",
                      width: `${(count / maxCount) * 100}%`,
                      minWidth: count > 0 ? "4px" : 0,
                      borderRadius: "var(--radius-pill)",
                      background: STATUS_COLOR[status] ?? NEUTRAL_COLOR,
                    }}
                  />
                </div>
                <span style={{ fontSize: "var(--text-caption)", fontWeight: 600, fontVariantNumeric: "tabular-nums", textAlign: "right" }}>{count}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="card">
        <h3>Accounts with overdue action items</h3>
        {data.staleAccounts.length === 0 ? (
          <p className="muted">No account has an overdue open action item right now.</p>
        ) : (
          <table>
            <thead><tr><th>Account</th><th>Overdue items</th></tr></thead>
            <tbody>
              {data.staleAccounts.map((a) => (
                <tr key={a.accountId}>
                  <td><Link to={`/accounts/${a.accountId}/briefing`}>{a.accountName}</Link></td>
                  <td><span className="badge warn">{a.overdueCount}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
