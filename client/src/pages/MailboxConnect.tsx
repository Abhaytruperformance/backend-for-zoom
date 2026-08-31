import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { api } from "../lib/api.js";
import { Icon, type IconName } from "../components/Icon.js";
import { ConfirmButton } from "../components/ConfirmButton.js";
import { toast } from "../lib/toast.js";

interface MailboxStatus { provider: "GOOGLE" | "MICROSOFT"; email: string; status: string }

const PROVIDER_META: Record<"GOOGLE" | "MICROSOFT", { label: string; icon: IconName; connectLabel: "google" | "microsoft" }> = {
  GOOGLE: { label: "Gmail", icon: "mail", connectLabel: "google" },
  MICROSOFT: { label: "Microsoft 365", icon: "mail-open", connectLabel: "microsoft" },
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

  async function disconnect(provider: "GOOGLE" | "MICROSOFT") {
    await api(`/mailbox/${provider}`, { method: "DELETE" });
    toast(`${PROVIDER_META[provider].label} disconnected`);
    setMailboxes((prev) => prev?.filter((m) => m.provider !== provider) ?? prev);
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
              <span className="provider-icon"><Icon name={meta.icon} size={20} /></span>
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
            <div style={{ display: "flex", gap: "0.5rem" }}>
              <button className="primary" onClick={() => connect(meta.connectLabel)}>
                {conn ? "Reconnect" : "Connect"} {meta.label}
              </button>
              {conn && (
                <ConfirmButton label="Disconnect" confirmLabel="Click again to disconnect" onConfirm={() => disconnect(key)} />
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
