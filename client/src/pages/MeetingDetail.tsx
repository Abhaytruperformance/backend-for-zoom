import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { api } from "../lib/api.js";
import { SkeletonCards } from "../components/Skeleton.js";
import { toast } from "../lib/toast.js";

interface LineageRef { id: string; description: string; meeting: { id: string; title: string; startTime: string | null } }
interface Decision {
  id: string;
  description: string;
  status: string;
  supersedes: LineageRef | null;
  supersededBy: LineageRef | null;
}
interface ActionItem {
  id: string;
  description: string;
  ownerDisplayName: string;
  ownerEmail: string | null;
  dueDate: string | null;
  status: string;
  supersedes: LineageRef | null;
  supersededBy: LineageRef | null;
}
interface MeetingFull {
  id: string;
  title: string;
  status: string;
  failureReason: string | null;
  startTime: string | null;
  needsResolution: boolean;
  account: { id: string; name: string } | null;
  extraction: { summary: string; risks: string[]; openQuestions: string[]; nextSteps: string[]; conversationType: string } | null;
  decisions: Decision[];
  actionItems: ActionItem[];
  followupDraft: {
    id: string;
    subject: string;
    status: string;
    approvalSnapshot: {
      subject: string;
      body: string;
      recipients: Array<{ name?: string; email: string }>;
      approvedAt: string;
      approvedByUser: { name: string | null; email: string } | null;
      sendAttempt: { status: string; providerMessageId: string | null; completedAt: string | null } | null;
    } | null;
  } | null;
}

const DECISION_STATUSES = ["CONFIRMED", "PROPOSED", "TENTATIVE", "REJECTED"];
const ACTION_STATUSES = ["OPEN", "COMPLETED", "CANCELLED"];
const CONVERSATION_TYPES = ["SALES", "PROJECT_DELIVERY", "INTERNAL", "OTHER"];

function decisionBadgeClass(status: string) {
  if (status === "CONFIRMED") return "ok";
  if (status === "REJECTED") return "err";
  if (status === "SUPERSEDED") return "";
  return "warn";
}

function formatMeetingDate(d: string | null) {
  return d ? new Date(d).toLocaleDateString() : "an earlier meeting";
}

export default function MeetingDetail() {
  const { id } = useParams();
  const [meeting, setMeeting] = useState<MeetingFull | null>(null);
  const [retrying, setRetrying] = useState(false);
  const [editingDecision, setEditingDecision] = useState<string | null>(null);
  const [editingAction, setEditingAction] = useState<string | null>(null);
  const [regenerating, setRegenerating] = useState(false);
  const [regenerateError, setRegenerateError] = useState<string | null>(null);
  const [editingTitle, setEditingTitle] = useState(false);

  function load() {
    api<MeetingFull>(`/meetings/${id}`).then(setMeeting);
  }

  useEffect(load, [id]);

  if (!meeting) return <div><div className="skeleton skeleton-line" style={{ width: "40%", height: "1.75rem", marginBottom: "1rem" }} /><SkeletonCards count={3} /></div>;

  async function retry() {
    setRetrying(true);
    await api(`/meetings/${id}/retry`, { method: "POST" })
      .then(() => toast("Retrying…"))
      .catch((e) => toast(e.message, "err"));
    setRetrying(false);
    load();
  }

  async function saveDecision(decisionId: string, status: string, description: string) {
    await api(`/decisions/${decisionId}`, { method: "PATCH", body: JSON.stringify({ status, description }) })
      .then(() => toast("Decision updated"))
      .catch((e) => toast(e.message, "err"));
    setEditingDecision(null);
    load();
  }

  async function saveAction(actionId: string, patch: { description?: string; status?: string; dueDate?: string | null; ownerDisplayName?: string }) {
    await api(`/actions/${actionId}`, { method: "PATCH", body: JSON.stringify(patch) })
      .then(() => toast("Action item updated"))
      .catch((e) => toast(e.message, "err"));
    setEditingAction(null);
    load();
  }

  async function saveTitle(title: string) {
    await api(`/meetings/${id}/title`, { method: "PATCH", body: JSON.stringify({ title }) })
      .then(() => toast("Renamed"))
      .catch((e) => toast(e.message, "err"));
    setEditingTitle(false);
    load();
  }

  async function saveConversationType(conversationType: string) {
    await api(`/meetings/${id}/conversation-type`, { method: "PATCH", body: JSON.stringify({ conversationType }) })
      .then(() => toast("Conversation type updated"))
      .catch((e) => toast(e.message, "err"));
    load();
  }

  async function regenerateExtraction() {
    setRegenerating(true);
    setRegenerateError(null);
    try {
      await api(`/meetings/${id}/regenerate-extraction`, { method: "POST" });
      load();
    } catch (e) {
      setRegenerateError(e instanceof Error ? e.message : "Regenerate failed");
    } finally {
      setRegenerating(false);
    }
  }

  return (
    <div>
      {editingTitle ? (
        <TitleEditor initial={meeting.title} onSave={saveTitle} onCancel={() => setEditingTitle(false)} />
      ) : (
        <div style={{ display: "flex", alignItems: "center", gap: "0.6rem" }}>
          <h1 style={{ marginBottom: 0 }}>{meeting.title}</h1>
          <button onClick={() => setEditingTitle(true)} aria-label="Rename meeting">Rename</button>
        </div>
      )}
      <p className="muted">{meeting.startTime ? new Date(meeting.startTime).toLocaleString() : ""} · <span className="badge">{meeting.status}</span></p>

      {meeting.status === "FAILED" && (
        <div className="card">
          <h3>Failed</h3>
          <p className="error">{meeting.failureReason}</p>
          <button onClick={retry} disabled={retrying}>Retry</button>
        </div>
      )}

      {meeting.needsResolution && (
        <div className="card">
          <h3>Needs resolution</h3>
          <p>This meeting matched more than one account — pick the right one on the Accounts page, or leave unlinked.</p>
        </div>
      )}

      {meeting.extraction && (
        <div className="card">
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "0.75rem" }}>
            <h2>What happened</h2>
            <button onClick={regenerateExtraction} disabled={regenerating}>{regenerating ? "Regenerating…" : "Regenerate"}</button>
          </div>
          <p>{meeting.extraction.summary}</p>
          {regenerateError && <p className="error">{regenerateError}</p>}
          <label style={{ display: "inline-block", marginBottom: 0 }}>
            <span className="muted" style={{ marginRight: "0.5rem" }}>Conversation type</span>
            <select
              value={meeting.extraction.conversationType}
              onChange={(e) => saveConversationType(e.target.value)}
              style={{ display: "inline-block", width: "auto", marginBottom: 0 }}
            >
              {CONVERSATION_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
          </label>
        </div>
      )}

      {meeting.decisions.length > 0 && (
        <div className="card">
          <h2>What did we decide</h2>
          <p className="muted" style={{ fontSize: "var(--text-caption)", marginTop: "-0.5rem" }}>
            If the AI got something wrong, click a decision to correct it.
          </p>
          <ul className="plain">
            {meeting.decisions.map((d) => (
              <li key={d.id}>
                {editingDecision === d.id ? (
                  <DecisionEditor decision={d} onSave={saveDecision} onCancel={() => setEditingDecision(null)} />
                ) : (
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "0.75rem" }}>
                    <div>
                      <div>{d.description} <span className={`badge ${decisionBadgeClass(d.status)}`}>{d.status}</span></div>
                      {d.supersedes && (
                        <p className="muted" style={{ fontSize: "var(--text-caption)", margin: "0.35rem 0 0" }}>
                          Updates a decision from {formatMeetingDate(d.supersedes.meeting.startTime)}: "{d.supersedes.description}"
                        </p>
                      )}
                      {d.supersededBy && (
                        <p className="muted" style={{ fontSize: "var(--text-caption)", margin: "0.35rem 0 0" }}>
                          Later superseded in <Link to={`/meetings/${d.supersededBy.meeting.id}`}>{d.supersededBy.meeting.title}</Link>
                        </p>
                      )}
                    </div>
                    {!d.supersededBy && <button onClick={() => setEditingDecision(d.id)}>Edit</button>}
                  </div>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}

      {meeting.actionItems.length > 0 && (
        <div className="card">
          <h2>What's still open</h2>
          <table>
            <thead><tr><th>Action</th><th>Owner</th><th>Due</th><th>Status</th><th /></tr></thead>
            <tbody>
              {meeting.actionItems.map((a) => (
                <ActionRow
                  key={a.id}
                  item={a}
                  editing={editingAction === a.id}
                  onEdit={() => setEditingAction(a.id)}
                  onCancel={() => setEditingAction(null)}
                  onSave={saveAction}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}

      {meeting.extraction && meeting.extraction.nextSteps.length > 0 && (
        <div className="card">
          <h2>Next steps</h2>
          <ul className="plain">
            {meeting.extraction.nextSteps.map((s, i) => <li key={i}>{s}</li>)}
          </ul>
        </div>
      )}

      {meeting.extraction && meeting.extraction.openQuestions.length > 0 && (
        <div className="card">
          <h2>Open questions</h2>
          <ul className="plain">
            {meeting.extraction.openQuestions.map((q, i) => <li key={i}>{q}</li>)}
          </ul>
        </div>
      )}

      {meeting.extraction && meeting.extraction.risks.length > 0 && (
        <div className="card">
          <h2>Risks</h2>
          <ul className="plain">
            {meeting.extraction.risks.map((r, i) => <li key={i}><span className="badge warn">risk</span> {r}</li>)}
          </ul>
        </div>
      )}

      {meeting.account && (
        <div className="card">
          <h2>What we know about this client</h2>
          <Link to={`/accounts/${meeting.account.id}/briefing`}>View {meeting.account.name}'s relationship briefing →</Link>
        </div>
      )}

      {meeting.followupDraft && (
        <div className="card">
          <h2>{meeting.followupDraft.status === "APPROVED" ? "What was sent" : "What will be sent"}</h2>
          {meeting.followupDraft.status === "APPROVED" && meeting.followupDraft.approvalSnapshot ? (
            <>
              <p>Subject: {meeting.followupDraft.approvalSnapshot.subject}</p>
              <p className="muted">
                To: {meeting.followupDraft.approvalSnapshot.recipients.map((r) => r.name ? `${r.name} <${r.email}>` : r.email).join(", ")}
              </p>
              <p className="muted">
                Approved by {meeting.followupDraft.approvalSnapshot.approvedByUser?.name ?? meeting.followupDraft.approvalSnapshot.approvedByUser?.email ?? "unknown"} on{" "}
                {new Date(meeting.followupDraft.approvalSnapshot.approvedAt).toLocaleString()}
              </p>
              <span className="badge">{meeting.followupDraft.approvalSnapshot.sendAttempt?.status ?? "PENDING"}</span>
              <p><Link to={`/meetings/${meeting.id}/approval`}>View full sent email →</Link></p>
            </>
          ) : (
            <>
              <p>Subject: {meeting.followupDraft.subject}</p>
              <span className="badge">{meeting.followupDraft.status}</span>
              <p><Link to={`/meetings/${meeting.id}/approval`}>Review and approve →</Link></p>
            </>
          )}
        </div>
      )}
    </div>
  );
}

function TitleEditor({ initial, onSave, onCancel }: { initial: string; onSave: (title: string) => void; onCancel: () => void }) {
  const [title, setTitle] = useState(initial);
  return (
    <div style={{ display: "flex", gap: "0.5rem", alignItems: "center", marginBottom: "0.5rem" }}>
      <input
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        style={{ fontSize: "var(--text-title1)", fontWeight: 700, marginBottom: 0 }}
        autoFocus
        onKeyDown={(e) => e.key === "Enter" && title.trim() && onSave(title.trim())}
      />
      <button className="primary" onClick={() => title.trim() && onSave(title.trim())}>Save</button>
      <button onClick={onCancel}>Cancel</button>
    </div>
  );
}

function DecisionEditor({
  decision,
  onSave,
  onCancel,
}: {
  decision: Decision;
  onSave: (id: string, status: string, description: string) => void;
  onCancel: () => void;
}) {
  const [description, setDescription] = useState(decision.description);
  const [status, setStatus] = useState(decision.status);

  return (
    <div>
      <input value={description} onChange={(e) => setDescription(e.target.value)} />
      <select value={status} onChange={(e) => setStatus(e.target.value)} style={{ marginBottom: "0.75rem" }}>
        {DECISION_STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
      </select>
      <div style={{ display: "flex", gap: "0.5rem" }}>
        <button className="primary" onClick={() => onSave(decision.id, status, description)}>Save</button>
        <button onClick={onCancel}>Cancel</button>
      </div>
    </div>
  );
}

function ActionRow({
  item,
  editing,
  onEdit,
  onCancel,
  onSave,
}: {
  item: ActionItem;
  editing: boolean;
  onEdit: () => void;
  onCancel: () => void;
  onSave: (id: string, patch: { description?: string; status?: string; dueDate?: string | null; ownerDisplayName?: string }) => void;
}) {
  const [description, setDescription] = useState(item.description);
  const [owner, setOwner] = useState(item.ownerDisplayName);
  const [dueDate, setDueDate] = useState(item.dueDate ? item.dueDate.slice(0, 10) : "");
  const [status, setStatus] = useState(item.status);

  if (editing) {
    return (
      <tr>
        <td colSpan={5}>
          <div style={{ display: "flex", gap: "0.5rem", alignItems: "center", flexWrap: "wrap" }}>
            <input style={{ flex: "2 1 220px", marginBottom: 0 }} value={description} onChange={(e) => setDescription(e.target.value)} placeholder="What needs to happen" />
            <input style={{ flex: "1 1 140px", marginBottom: 0 }} value={owner} onChange={(e) => setOwner(e.target.value)} placeholder="Owner" />
            <input style={{ flex: "1 1 150px", marginBottom: 0 }} type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
            <select style={{ flex: "1 1 130px", marginBottom: 0 }} value={status} onChange={(e) => setStatus(e.target.value)}>
              {ACTION_STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
            <button className="primary" onClick={() => onSave(item.id, { description, status, dueDate: dueDate || null, ownerDisplayName: owner })}>Save</button>
            <button onClick={onCancel}>Cancel</button>
          </div>
        </td>
      </tr>
    );
  }

  return (
    <tr>
      <td>
        {item.description}
        {item.supersedes && (
          <div className="muted" style={{ fontSize: "var(--text-caption)", marginTop: "0.25rem" }}>
            Updates a commitment from {formatMeetingDate(item.supersedes.meeting.startTime)}
          </div>
        )}
        {item.supersededBy && (
          <div className="muted" style={{ fontSize: "var(--text-caption)", marginTop: "0.25rem" }}>
            Later updated in <Link to={`/meetings/${item.supersededBy.meeting.id}`}>{item.supersededBy.meeting.title}</Link>
          </div>
        )}
      </td>
      <td>{item.ownerDisplayName}</td>
      <td className="muted">{item.dueDate ? new Date(item.dueDate).toLocaleDateString() : "—"}</td>
      <td><span className="badge">{item.status}</span></td>
      <td>{!item.supersededBy && <button onClick={onEdit}>Edit</button>}</td>
    </tr>
  );
}
