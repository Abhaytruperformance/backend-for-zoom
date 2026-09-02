import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../lib/api.js";
import { SkeletonList } from "../components/Skeleton.js";
import { EmptyState } from "../components/EmptyState.js";
import { Pagination } from "../components/Pagination.js";
import { toast } from "../lib/toast.js";

interface AccountRow { id: string; name: string; lastMeetingAt: string | null; contacts: Array<{ id: string }> }
interface AccountsPage { items: AccountRow[]; total: number; page: number; pageSize: number }
interface NeedsResolutionMeeting { id: string; title: string; startTime: string | null }

const PAGE_SIZE = 25;

export default function Accounts() {
  const [result, setResult] = useState<AccountsPage | null>(null);
  const [needsResolution, setNeedsResolution] = useState<NeedsResolutionMeeting[]>([]);
  const [chosenAccount, setChosenAccount] = useState<Record<string, string>>({});
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [showNewAccount, setShowNewAccount] = useState(false);

  function loadNeedsResolution() {
    api<NeedsResolutionMeeting[]>("/accounts/needs-resolution").then(setNeedsResolution);
  }

  useEffect(loadNeedsResolution, []);

  useEffect(() => {
    const t = setTimeout(() => setSearch(searchInput.trim()), 300);
    return () => clearTimeout(t);
  }, [searchInput]);

  useEffect(() => setPage(1), [search]);

  function load() {
    const params = new URLSearchParams({ page: String(page), pageSize: String(PAGE_SIZE) });
    if (search) params.set("search", search);
    api<AccountsPage>(`/accounts?${params}`).then(setResult);
  }

  useEffect(load, [search, page]);

  async function resolve(meetingId: string) {
    const accountId = chosenAccount[meetingId];
    if (!accountId) return;
    await api(`/meetings/${meetingId}/resolve-account`, { method: "POST", body: JSON.stringify({ accountId }) });
    toast("Account assigned");
    loadNeedsResolution();
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
                  {(result?.items ?? []).map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
                </select>
                <button onClick={() => resolve(m.id)}>Assign</button>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="card">
        <input placeholder="Search accounts…" value={searchInput} onChange={(e) => setSearchInput(e.target.value)} style={{ marginBottom: "0.75rem" }} />
        {result === null ? (
          <SkeletonList rows={3} />
        ) : result.items.length === 0 ? (
          search ? (
            <p className="muted">No accounts match "{search}".</p>
          ) : (
            <EmptyState
              icon="building"
              title="No accounts yet"
              description="Create one manually, or wait for a meeting's participant email to match a known contact or domain."
            />
          )
        ) : (
          <>
            <table>
              <thead><tr><th>Account</th><th>Contacts</th><th>Last meeting</th></tr></thead>
              <tbody>
                {result.items.map((a) => (
                  <tr key={a.id}>
                    <td><Link to={`/accounts/${a.id}/briefing`}>{a.name}</Link></td>
                    <td className="muted">{a.contacts.length}</td>
                    <td className="muted">{a.lastMeetingAt ? new Date(a.lastMeetingAt).toLocaleDateString() : "—"}</td>
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
