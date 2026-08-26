import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../lib/api.js";
import { SkeletonList } from "../components/Skeleton.js";
import { EmptyState } from "../components/EmptyState.js";
import { toast } from "../lib/toast.js";

interface AccountRow { id: string; name: string; lastMeetingAt: string | null; contacts: Array<{ id: string }> }
interface NeedsResolutionMeeting { id: string; title: string; startTime: string | null }

export default function Accounts() {
  const [accounts, setAccounts] = useState<AccountRow[] | null>(null);
  const [needsResolution, setNeedsResolution] = useState<NeedsResolutionMeeting[]>([]);
  const [chosenAccount, setChosenAccount] = useState<Record<string, string>>({});
  const [search, setSearch] = useState("");
  const [showNewAccount, setShowNewAccount] = useState(false);

  function load() {
    api<AccountRow[]>("/accounts").then(setAccounts);
    api<NeedsResolutionMeeting[]>("/accounts/needs-resolution").then(setNeedsResolution);
  }

  useEffect(load, []);

  const filtered = useMemo(() => {
    if (!accounts) return null;
    const q = search.trim().toLowerCase();
    return q ? accounts.filter((a) => a.name.toLowerCase().includes(q)) : accounts;
  }, [accounts, search]);

  async function resolve(meetingId: string) {
    const accountId = chosenAccount[meetingId];
    if (!accountId) return;
    await api(`/meetings/${meetingId}/resolve-account`, { method: "POST", body: JSON.stringify({ accountId }) });
    toast("Account assigned");
    load();
  }

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "0.75rem" }}>
        <h1>Accounts</h1>
        <button className="primary" onClick={() => setShowNewAccount((s) => !s)}>{showNewAccount ? "Cancel" : "+ New account"}</button>
      </div>

      {showNewAccount && (
        <NewAccountForm
          onCreated={() => {
            setShowNewAccount(false);
            load();
          }}
        />
      )}

      {needsResolution.length > 0 && (
        <div className="card">
          <h3>Needs resolution</h3>
          <p className="muted">These meetings matched more than one account — pick the right one.</p>
          <ul className="plain">
            {needsResolution.map((m) => (
              <li key={m.id} style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
                <span style={{ flex: 1 }}>{m.title}</span>
                <select value={chosenAccount[m.id] ?? ""} onChange={(e) => setChosenAccount({ ...chosenAccount, [m.id]: e.target.value })} style={{ width: 200, marginBottom: 0 }}>
                  <option value="">Choose account…</option>
                  {(accounts ?? []).map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
                </select>
                <button onClick={() => resolve(m.id)}>Assign</button>
              </li>
            ))}
          </ul>
        </div>
      )}

      {accounts === null ? (
        <SkeletonList rows={3} />
      ) : accounts.length === 0 ? (
        <EmptyState
          icon="building"
          title="No accounts yet"
          description="Create one manually, or wait for a meeting's participant email to match a known contact or domain."
        />
      ) : (
        <div className="card">
          <input placeholder="Search accounts…" value={search} onChange={(e) => setSearch(e.target.value)} style={{ marginBottom: filtered?.length ? "0.75rem" : 0 }} />
          {filtered && filtered.length === 0 ? (
            <p className="muted">No accounts match "{search}".</p>
          ) : (
            <table>
              <thead><tr><th>Account</th><th>Contacts</th><th>Last meeting</th></tr></thead>
              <tbody>
                {filtered?.map((a) => (
                  <tr key={a.id}>
                    <td><Link to={`/accounts/${a.id}/briefing`}>{a.name}</Link></td>
                    <td className="muted">{a.contacts.length}</td>
                    <td className="muted">{a.lastMeetingAt ? new Date(a.lastMeetingAt).toLocaleDateString() : "—"}</td>
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

function NewAccountForm({ onCreated }: { onCreated: () => void }) {
  const [name, setName] = useState("");
  const [domains, setDomains] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api("/accounts", {
        method: "POST",
        body: JSON.stringify({ name, domains: domains.split(",").map((d) => d.trim()).filter(Boolean) }),
      });
      toast("Account created");
      onCreated();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create account");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="card">
      <h2>New account</h2>
      <form onSubmit={submit}>
        <label>Account / company name</label>
        <input value={name} onChange={(e) => setName(e.target.value)} required autoFocus />
        <label>Email domains (comma-separated, used to auto-match future meetings)</label>
        <input value={domains} onChange={(e) => setDomains(e.target.value)} placeholder="acme.com, acme.io" />
        {error && <p className="error">{error}</p>}
        <button className="primary" type="submit" disabled={busy || !name.trim()}>{busy ? "Creating…" : "Create account"}</button>
      </form>
    </div>
  );
}
