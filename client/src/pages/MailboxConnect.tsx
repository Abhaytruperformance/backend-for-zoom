import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { api } from "../lib/api.js";

interface MailboxStatus { provider: "GOOGLE" | "MICROSOFT"; email: string; status: string }

const PROVIDER_META = {
  GOOGLE: { label: "Gmail", icon: "✉️", connectLabel: "google" as const },
  MICROSOFT: { label: "Microsoft 365", icon: "📧", connectLabel: "microsoft" as const },
};

export default function MailboxConnect() {
  const [mailboxes, setMailboxes] = useState<MailboxStatus[] | null>(null);
  const [params, setParams] = useSearchParams();
  const callbackError = params.get("error");

  useEffect(() => {
    api<MailboxStatus[]>("/mailbox/status").then(setMailboxes);
    if (params.get("connected") || params.get("error")) {
      setParams({}, { replace: true }); // clear the one-time callback params from the URL
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function connect(provider: "google" | "microsoft") {
    const { authorizeUrl } = await api<{ authorizeUrl: string }>(`/mailbox/${provider}/connect`);
    window.location.href = authorizeUrl;
  }

  function forProvider(p: "GOOGLE" | "MICROSOFT") {
    return mailboxes?.find((m) => m.provider === p);
  }

  return (
    <div>
      <h1>Mailbox connections</h1>
      <p className="muted">Follow-up emails send from your own mailbox, not a shared app address. Connect at least one before approving a send.</p>
      {callbackError && <p className="error">{callbackError}</p>}

      {(["GOOGLE", "MICROSOFT"] as const).map((key) => {
        const meta = PROVIDER_META[key];
        const conn = forProvider(key);
        const active = conn?.status === "ACTIVE";
        return (
          <div className="card" key={key}>
            <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", marginBottom: "1rem" }}>
              <span style={{ fontSize: "1.4rem" }}>{meta.icon}</span>
              <div>
                <div style={{ fontWeight: 600 }}>{meta.label}</div>
                {mailboxes === null ? (
                  <div className="skeleton skeleton-line" style={{ width: 140, marginTop: "0.35rem" }} />
                ) : conn ? (
                  <div className="muted" style={{ fontSize: "var(--text-caption)" }}>
                    {conn.email} · <span className={`badge ${active ? "ok" : "err"}`}>{conn.status.replace(/_/g, " ")}</span>
                  </div>
                ) : (
                  <div className="muted" style={{ fontSize: "var(--text-caption)" }}>Not connected</div>
                )}
              </div>
            </div>
            <button className="primary" onClick={() => connect(meta.connectLabel)}>
              {conn ? "Reconnect" : "Connect"} {meta.label}
            </button>
          </div>
        );
      })}
    </div>
  );
}
