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

interface ZoomStatus {
  connected: boolean;
  status: string;
  companySyncActive: boolean;
}

export default function ZoomConnect() {
  const [status, setStatus] = useState<ZoomStatus | null>(null);
  const [params, setParams] = useSearchParams();
  const callbackError = params.get("error");

  useEffect(() => {
    api<ZoomStatus>("/zoom/status").then(setStatus);
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
    setStatus((prev) => ({ connected: false, status: "NOT_CONNECTED", companySyncActive: prev?.companySyncActive ?? false }));
  }

  const [backfilling, setBackfilling] = useState(false);

  async function backfill() {
    setBackfilling(true);
    try {
      const { queued } = await api<{ queued: number }>("/zoom/backfill", { method: "POST" });
      toast(queued > 0 ? `Importing ${queued} past meeting${queued === 1 ? "" : "s"} — processing in the background` : "No new past meetings found");
    } finally {
      setBackfilling(false);
    }
  }

  const copy = status ? STATUS_COPY[status.status] ?? STATUS_COPY.NOT_CONNECTED : null;

  return (
    <div>
      <h1>Zoom connection</h1>
      <p className="muted">Powers meeting capture, transcript retrieval, and participant matching.</p>
      {callbackError && <p className="error">{callbackError}</p>}
      {status?.companySyncActive && (
        <div className="card" style={{ marginBottom: "1rem", display: "flex", alignItems: "center", gap: "0.75rem" }}>
          <StatusDot tone="ok" />
          <div>
            <div><span className="badge ok">COMPANY SYNC ACTIVE</span></div>
            <div className="muted" style={{ fontSize: "var(--text-caption)", marginTop: "0.2rem" }}>
              Meetings across your whole Zoom account sync in automatically (Server-to-Server) — no personal connect needed for that. The status below is only for connecting your own individual Zoom account on top of that, if you want to.
            </div>
          </div>
        </div>
      )}
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
            <>
              <button onClick={backfill} disabled={backfilling}>
                {backfilling ? "Importing…" : "Import past meetings"}
              </button>
              <ConfirmButton label="Disconnect" confirmLabel="Click again to disconnect" onConfirm={disconnect} />
            </>
          )}
        </div>
        {status?.connected && (
          <p className="muted" style={{ fontSize: "var(--text-caption)", marginTop: "0.5rem" }}>
            Pulls recorded meetings from the last 30 days that predate connecting Zoom here.
            Only meetings with a cloud recording are found; a meeting whose transcript isn't
            ready yet may end up marked Failed.
          </p>
        )}
      </div>
    </div>
  );
}
