import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { api } from "../lib/api.js";
import { SkeletonCards } from "../components/Skeleton.js";
import { ConfirmButton } from "../components/ConfirmButton.js";
import { toast } from "../lib/toast.js";

interface Recipient { name?: string; email: string }
interface SendAttempt {
  provider: string;
  status: string;
  providerMessageId: string | null;
  completedAt: string | null;
  lastError: string | null;
}
interface ApprovalSnapshot {
  subject: string;
  body: string;
  recipients: Recipient[];
  approvedAt: string;
  approvedByUser: { name: string | null; email: string } | null;
  sendAttempt: SendAttempt | null;
}
interface DraftMeeting {
  id: string;
  title: string;
  status: string;
  extraction: { summary: string } | null;
  account: { relationshipSummaries: Array<{ content: string }> } | null;
  followupDraft: {
    id: string;
    subject: string;
    body: string;
    recipients: Recipient[];
    status: string;
    tonePreset: string;
    approvalSnapshot: ApprovalSnapshot | null;
  } | null;
}
interface MailboxStatus { provider: "GOOGLE" | "MICROSOFT"; email: string; status: string }

const TONE_PRESETS = [
  { value: "internal", label: "Internal" },
  { value: "client-formal", label: "Client — formal" },
  { value: "client-casual", label: "Client — casual" },
];

export default function ApprovalScreen() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [meeting, setMeeting] = useState<DraftMeeting | null>(null);
  const [mailboxes, setMailboxes] = useState<MailboxStatus[]>([]);
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [recipients, setRecipients] = useState<Recipient[]>([]);
  const [tonePreset, setTonePreset] = useState("client-formal");
  const [provider, setProvider] = useState<"GOOGLE" | "MICROSOFT" | "">("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api<DraftMeeting>(`/approval/${id}`).then((m) => {
      setMeeting(m);
      if (m.followupDraft) {
        setSubject(m.followupDraft.subject);
        setBody(m.followupDraft.body);
        setRecipients(m.followupDraft.recipients);
        setTonePreset(m.followupDraft.tonePreset);
      }
    });
    api<MailboxStatus[]>("/mailbox/status").then((list) => {
      setMailboxes(list);
      const active = list.find((m) => m.status === "ACTIVE");
      if (active) setProvider(active.provider);
    });
  }, [id]);

  if (!meeting) return <div><div className="skeleton skeleton-line" style={{ width: "50%", height: "1.75rem", marginBottom: "1rem" }} /><SkeletonCards count={2} /></div>;
  const draft = meeting.followupDraft;
  const alreadyApproved = draft?.status === "APPROVED";
  const snapshot = draft?.approvalSnapshot ?? null;
  const relationshipSummary = meeting.account?.relationshipSummaries[0]?.content;

  async function saveDraft(silent = false) {
    await api(`/approval/${id}/draft`, { method: "PATCH", body: JSON.stringify({ subject, body, recipients }) });
    if (!silent) toast("Draft saved");
  }

  async function regenerate() {
    setBusy(true);
    setError(null);
    try {
      const updated = await api<DraftMeeting["followupDraft"]>(`/approval/${id}/regenerate`, { method: "POST", body: JSON.stringify({ tonePreset }) });
      if (updated) {
        setSubject(updated.subject);
        setBody(updated.body);
        setRecipients(updated.recipients);
        setTonePreset(updated.tonePreset);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Regenerate failed");
    } finally {
      setBusy(false);
    }
  }

  async function approve() {
    if (!provider) {
      setError("Connect a mailbox (Gmail or Microsoft) before approving a send.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await saveDraft(true);
      await api(`/approval/${id}/approve`, { method: "POST", body: JSON.stringify({ subject, body, recipients, mailboxProvider: provider }) });
      toast("Approved — sending now");
      navigate(`/meetings/${id}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Approval failed");
    } finally {
      setBusy(false);
    }
  }

  async function reject() {
    setBusy(true);
    await api(`/approval/${id}/reject`, { method: "POST" })
      .then(() => toast("Draft rejected"))
      .catch((e) => setError(e.message));
    setBusy(false);
    navigate(`/meetings/${id}`);
  }

  return (
    <div>
      <h1>Review follow-up — {meeting.title}</h1>

      {relationshipSummary && (
        <div className="card">
          <h3>Relationship context used</h3>
          <p className="muted">{relationshipSummary}</p>
        </div>
      )}

      {!alreadyApproved && (
        <div className="card">
          <h2>Draft email</h2>
          <label>Subject</label>
          <input value={subject} onChange={(e) => setSubject(e.target.value)} />
          <label>Body</label>
          <textarea rows={10} value={body} onChange={(e) => setBody(e.target.value)} />
          <label>Recipients</label>
          {recipients.map((r, i) => (
            <div key={i} style={{ display: "flex", gap: "0.5rem" }}>
              <input
                value={r.email}
                onChange={(e) => setRecipients(recipients.map((x, j) => (j === i ? { ...x, email: e.target.value } : x)))}
              />
              <button onClick={() => setRecipients(recipients.filter((_, j) => j !== i))}>Remove</button>
            </div>
          ))}
          <button onClick={() => setRecipients([...recipients, { email: "" }])}>Add recipient</button>
        </div>
      )}

      {!alreadyApproved && (
        <div className="card">
          <h2>Send from</h2>
          {mailboxes.length === 0 && <p className="muted">No mailbox connected — go to the Mailbox page first.</p>}
          <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
            {mailboxes.map((m) => {
              const selected = provider === m.provider;
              const usable = m.status === "ACTIVE";
              return (
                <label
                  key={m.provider}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "0.6rem",
                    padding: "0.65rem 0.85rem",
                    borderRadius: "var(--radius-sm)",
                    border: `1px solid ${selected ? "var(--accent)" : "var(--border-strong)"}`,
                    background: selected ? "var(--accent-tint)" : "transparent",
                    cursor: usable ? "pointer" : "not-allowed",
                    opacity: usable ? 1 : 0.6,
                  }}
                >
                  <input type="radio" name="provider" checked={selected} onChange={() => setProvider(m.provider)} disabled={!usable} style={{ width: "auto", marginBottom: 0 }} />
                  <span style={{ fontWeight: 500 }}>{m.provider === "GOOGLE" ? "Gmail" : "Microsoft 365"}</span>
                  <span className="muted">{m.email}</span>
                  <span style={{ flex: 1 }} />
                  <span className={`badge ${usable ? "ok" : "err"}`}>{m.status}</span>
                </label>
              );
            })}
          </div>
        </div>
      )}

      {error && <p className="error">{error}</p>}

      {alreadyApproved ? (
        <div className="card">
          <h3>What was sent</h3>
          {snapshot ? (
            <>
              <p className="muted">
                Approved by {snapshot.approvedByUser?.name ?? snapshot.approvedByUser?.email ?? "unknown"} on{" "}
                {new Date(snapshot.approvedAt).toLocaleString()}
              </p>
              <label>Subject</label>
              <input value={snapshot.subject} disabled />
              <label>Body</label>
              <textarea rows={10} value={snapshot.body} disabled />
              <label>Recipients</label>
              <p>{snapshot.recipients.map((r) => r.name ? `${r.name} <${r.email}>` : r.email).join(", ")}</p>
              <p>
                Send status: <span className="badge">{snapshot.sendAttempt?.status ?? "PENDING"}</span>
                {snapshot.sendAttempt?.completedAt && ` — ${new Date(snapshot.sendAttempt.completedAt).toLocaleString()}`}
              </p>
              {snapshot.sendAttempt?.providerMessageId && (
                <p className="muted">Provider message ID: {snapshot.sendAttempt.providerMessageId}</p>
              )}
              {snapshot.sendAttempt?.lastError && <p className="error">{snapshot.sendAttempt.lastError}</p>}
            </>
          ) : (
            <p>Send status: <span className="badge">PENDING</span></p>
          )}
        </div>
      ) : (
        <div style={{ display: "flex", gap: "0.6rem", alignItems: "center", flexWrap: "wrap" }}>
          <select value={tonePreset} onChange={(e) => setTonePreset(e.target.value)} style={{ width: "auto", marginBottom: 0 }}>
            {TONE_PRESETS.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
          </select>
          <button onClick={() => saveDraft()} disabled={busy}>Save draft</button>
          <button onClick={regenerate} disabled={busy}>Regenerate</button>
          <ConfirmButton label="Reject" confirmLabel="Confirm reject?" onConfirm={reject} disabled={busy} />
          <button className="primary" onClick={approve} disabled={busy}>Approve &amp; send</button>
        </div>
      )}
    </div>
  );
}
