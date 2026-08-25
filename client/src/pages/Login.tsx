import { useState } from "react";
import { api, setToken } from "../lib/api.js";

type Mode = "login" | "register" | "forgot" | "reset";

export default function Login({ onLoggedIn }: { onLoggedIn: () => void }) {
  const [mode, setMode] = useState<Mode>("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [tenantName, setTenantName] = useState("");
  const [token, setResetToken] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  function switchMode(next: Mode, keepInfo = false) {
    setMode(next);
    setError(null);
    if (!keepInfo) setInfo(null);
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setInfo(null);
    setBusy(true);
    try {
      if (mode === "login") {
        const result = await api<{ token: string }>("/auth/login", { method: "POST", body: JSON.stringify({ email, password }) });
        setToken(result.token);
        onLoggedIn();
      } else if (mode === "register") {
        const result = await api<{ token: string }>("/auth/register", { method: "POST", body: JSON.stringify({ email, password, tenantName }) });
        setToken(result.token);
        onLoggedIn();
      } else if (mode === "forgot") {
        await api("/auth/forgot-password", { method: "POST", body: JSON.stringify({ email }) });
        setInfo("If that email is registered, a reset token was generated — this demo build has no email sending configured, so ask whoever runs the server to check its console log for the token.");
        switchMode("reset", true);
      } else {
        const result = await api<{ token: string }>("/auth/reset-password", { method: "POST", body: JSON.stringify({ email, token, newPassword }) });
        setToken(result.token);
        onLoggedIn();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setBusy(false);
    }
  }

  const titles: Record<Mode, string> = {
    login: "Welcome back",
    register: "Create your workspace",
    forgot: "Reset your password",
    reset: "Enter your reset token",
  };
  const subtitles: Record<Mode, string> = {
    login: "Log in to your relationship intelligence workspace.",
    register: "One meeting at a time, turned into lasting knowledge.",
    forgot: "We'll generate a one-time reset token.",
    reset: "Check the server console for the token, then set a new password.",
  };

  return (
    <div className="auth-shell">
      <div className="auth-card">
        <div className="auth-mark" aria-hidden="true">◐</div>
        <h1 style={{ textAlign: "center" }}>{titles[mode]}</h1>
        <p className="muted" style={{ textAlign: "center", marginBottom: "1.5rem" }}>{subtitles[mode]}</p>

        <form onSubmit={submit}>
          {mode === "register" && (
            <>
              <label>Company / workspace name</label>
              <input value={tenantName} onChange={(e) => setTenantName(e.target.value)} required autoFocus />
            </>
          )}

          {mode !== "reset" && (
            <>
              <label>Email</label>
              <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoFocus={mode !== "register"} />
            </>
          )}

          {(mode === "login" || mode === "register") && (
            <>
              <label>Password</label>
              <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={8} />
            </>
          )}

          {mode === "reset" && (
            <>
              <label>Email</label>
              <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoFocus />
              <label>Reset token</label>
              <input value={token} onChange={(e) => setResetToken(e.target.value)} required placeholder="From the server console log" />
              <label>New password</label>
              <input type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} required minLength={8} />
            </>
          )}

          {info && <p className="muted" style={{ fontSize: "var(--text-caption)" }}>{info}</p>}
          {error && <p className="error">{error}</p>}

          <button className="primary" type="submit" disabled={busy} style={{ width: "100%", marginTop: "0.25rem" }}>
            {busy
              ? "One moment…"
              : mode === "login" ? "Log in"
              : mode === "register" ? "Create workspace"
              : mode === "forgot" ? "Send reset token"
              : "Set new password"}
          </button>
        </form>

        <div style={{ marginTop: "1.25rem", textAlign: "center", display: "flex", flexDirection: "column", gap: "0.4rem" }}>
          {mode === "login" && (
            <>
              <button onClick={() => switchMode("register")} style={{ border: "none", background: "none", color: "var(--accent)", fontWeight: 500 }}>
                Need a workspace? Register
              </button>
              <button onClick={() => switchMode("forgot")} style={{ border: "none", background: "none", color: "var(--text-muted)", fontWeight: 500 }}>
                Forgot password?
              </button>
            </>
          )}
          {mode !== "login" && (
            <button onClick={() => switchMode("login")} style={{ border: "none", background: "none", color: "var(--accent)", fontWeight: 500 }}>
              Back to log in
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
