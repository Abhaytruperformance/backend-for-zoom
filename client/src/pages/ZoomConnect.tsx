import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { api } from "../lib/api.js";
import { StatusDot } from "../components/Icon.js";
import { ConfirmButton } from "../components/ConfirmButton.js";
import { toast } from "../lib/toast.js";

type Tone = "ok" | "warn" | "err" | "idle";

const STATUS_COPY: Record<string, { badge: string; tone: Tone; note: string }> = {
  ACTIVE: { badge: "ok", tone: "ok", note: "Connected and healthy." },
  REAUTH_REQUIRED: { badge: "err", tone: "warn", note: "Access expired — reconnect to keep meetings flowing in." },
  REVOKED: { badge: "err", tone: "err", note: "Access was revoked. Reconnect to resume." },
  NOT_CONNECTED: { badge: "", tone: "idle", note: "Not connected yet." },
};

export default function ZoomConnect() {
  const [status, setStatus] = useState<{ connected: boolean; status: string } | null>(null);
  const [params, setParams] = useSearchParams();
  const callbackError = params.get("error");

  useEffect(() => {
    api<{ connected: boolean; status: string }>("/zoom/status").then(setStatus);
    if (params.get("connected") || params.get("error")) {
      setParams({}, { replace: true }); // clear the one-time callback params from the URL
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function connect() {
    const { authorizeUrl } = await api<{ authorizeUrl: string }>("/zoom/connect");
    window.location.href = authorizeUrl;
  }

  async function disconnect() {
    await api("/zoom/connection", { method: "DELETE" });
    toast("Zoom disconnected");
    setStatus({ connected: false, status: "NOT_CONNECTED" });
  }

  const copy = status ? STATUS_COPY[status.status] ?? STATUS_COPY.NOT_CONNECTED : null;

  return (
    <div>
      <h1>Zoom connection</h1>
      <p className="muted">Powers meeting capture, transcript retrieval, and participant matching.</p>
      {callbackError && <p className="error">{callbackError}</p>}
      <div className="card">
        {!status ? (
          <div className="skeleton skeleton-line" style={{ width: "40%" }} />
        ) : (
          <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", marginBottom: "1rem" }}>
            <StatusDot tone={copy!.tone} />
            <div>
              <div><span className={`badge ${copy!.badge}`}>{status.status.replace(/_/g, " ")}</span></div>
              <div className="muted" style={{ fontSize: "var(--text-caption)", marginTop: "0.2rem" }}>{copy!.note}</div>
            </div>
          </div>
        )}
        <div style={{ display: "flex", gap: "0.5rem" }}>
          <button className="primary" onClick={connect}>
            {status?.connected ? "Reconnect Zoom" : "Connect Zoom"}
          </button>
          {status?.connected && (
            <ConfirmButton label="Disconnect" confirmLabel="Click again to disconnect" onConfirm={disconnect} />
          )}
        </div>
      </div>
    </div>
  );
}
