import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { api } from "../lib/api.js";
import { SkeletonCards } from "../components/Skeleton.js";
import { toast } from "../lib/toast.js";

interface Contact { id: string; name: string; email: string; role: string | null }
interface Briefing {
  account: { name: string };
  contacts: Contact[];
  relationshipSummary: string | null;
  lastMeetingDate: string | null;
  openCommitments: Array<{ id: string; description: string; ownerDisplayName: string; dueDate: string | null }>;
  confirmedDecisions: Array<{ id: string; description: string }>;
  tentativeDecisions: Array<{ id: string; description: string; status: string }>;
  openQuestions: string[];
  recentMeetings: Array<{ id: string; date: string | null; title: string }>;
  meetingsLast30Days: number;
}

export default function AccountBriefing() {
  const { id } = useParams();
  const [b, setB] = useState<Briefing | null>(null);
  const [showAddContact, setShowAddContact] = useState(false);

  function load() {
    api<Briefing>(`/accounts/${id}/briefing`).then(setB);
  }

  useEffect(load, [id]);

  if (!b) return <div><div className="skeleton skeleton-line" style={{ width: "45%", height: "1.75rem", marginBottom: "1rem" }} /><SkeletonCards count={3} /></div>;

  return (
    <div>
      <h1>{b.account.name}</h1>
      <p className="muted">
        Last meeting: {b.lastMeetingDate ? new Date(b.lastMeetingDate).toLocaleDateString() : "—"} · {b.meetingsLast30Days} meeting(s) in the last 30 days
      </p>

      <div className="card">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <h3 style={{ margin: 0 }}>Contacts</h3>
          <button onClick={() => setShowAddContact((s) => !s)}>{showAddContact ? "Cancel" : "+ Add contact"}</button>
        </div>
        {showAddContact && id && (
          <AddContactForm accountId={id} onCreated={() => { setShowAddContact(false); load(); }} />
        )}
        {b.contacts.length === 0 ? (
          <p className="muted" style={{ marginTop: "0.75rem" }}>No contacts yet — meetings won't auto-resolve to this account until one matches.</p>
        ) : (
          <ul className="plain" style={{ marginTop: "0.5rem" }}>
            {b.contacts.map((c) => (
              <li key={c.id}>{c.name} <span className="muted">· {c.email}{c.role ? ` · ${c.role}` : ""}</span></li>
            ))}
          </ul>
        )}
      </div>

      <div className="card">
        <h3>Relationship</h3>
        <p>{b.relationshipSummary ?? <span className="muted">No summary yet.</span>}</p>
      </div>

      <div className="card">
        <h3>Confirmed decisions</h3>
        {b.confirmedDecisions.length === 0 && <p className="muted">None yet.</p>}
        <ul className="plain">
          {b.confirmedDecisions.map((d) => <li key={d.id}>{d.description}</li>)}
        </ul>
      </div>

      {b.tentativeDecisions.length > 0 && (
        <div className="card">
          <h3>Tentatively discussed (unconfirmed)</h3>
          <ul className="plain">
            {b.tentativeDecisions.map((d) => (
              <li key={d.id}>{d.description} <span className="badge warn">{d.status}</span></li>
            ))}
          </ul>
        </div>
      )}

      <div className="card">
        <h3>Open commitments</h3>
        {b.openCommitments.length === 0 && <p className="muted">Nothing open.</p>}
        <ul className="plain">
          {b.openCommitments.map((a) => (
            <li key={a.id}>
              {a.ownerDisplayName} → {a.description} {a.dueDate && <span className="muted">(due {new Date(a.dueDate).toLocaleDateString()})</span>}
            </li>
          ))}
        </ul>
      </div>

      {b.openQuestions.length > 0 && (
        <div className="card">
          <h3>Open questions</h3>
          <ul className="plain">{b.openQuestions.map((q, i) => <li key={i}>{q}</li>)}</ul>
        </div>
      )}

      <div className="card">
        <h3>Recent meetings</h3>
        <ul className="plain">
          {b.recentMeetings.map((m) => (
            <li key={m.id}>
              <Link to={`/meetings/${m.id}`}>{m.title}</Link> <span className="muted">{m.date ? new Date(m.date).toLocaleDateString() : ""}</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

function AddContactForm({ accountId, onCreated }: { accountId: string; onCreated: () => void }) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [role, setRole] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api("/contacts", { method: "POST", body: JSON.stringify({ accountId, name, email, role: role || undefined }) });
      toast("Contact added");
      onCreated();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to add contact");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} style={{ display: "flex", gap: "0.5rem", alignItems: "flex-start", flexWrap: "wrap", margin: "0.75rem 0" }}>
      <input style={{ flex: "1 1 160px", marginBottom: 0 }} placeholder="Name" value={name} onChange={(e) => setName(e.target.value)} required autoFocus />
      <input style={{ flex: "1 1 200px", marginBottom: 0 }} type="email" placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} required />
      <input style={{ flex: "1 1 140px", marginBottom: 0 }} placeholder="Role (optional)" value={role} onChange={(e) => setRole(e.target.value)} />
      <button className="primary" type="submit" disabled={busy}>{busy ? "Adding…" : "Add"}</button>
      {error && <p className="error" style={{ width: "100%" }}>{error}</p>}
    </form>
  );
}
