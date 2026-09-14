import { Link } from "react-router-dom";

export function LegalLayout({ title, updated, children }: { title: string; updated?: string; children: React.ReactNode }) {
  return (
    <div style={{ minHeight: "100vh", background: "var(--canvas)" }}>
      <nav>
        <Link to="/" className="brand" style={{ textDecoration: "none" }}>
          <img src="/logo.png" alt="Tru Performance" />
        </Link>
        <span className="spacer" />
        <Link to="/login">Log in</Link>
      </nav>
      <main style={{ maxWidth: 720 }}>
        <h1>{title}</h1>
        {updated && <p className="muted" style={{ marginTop: "-0.5rem" }}>Last updated: {updated}</p>}
        <div className="legal-content">{children}</div>
      </main>
    </div>
  );
}
