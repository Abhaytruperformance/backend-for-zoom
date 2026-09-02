import { NavLink, Navigate, Outlet, Route, Routes } from "react-router-dom";
import { useState } from "react";
import { getToken, clearToken } from "./lib/api.js";
import Login from "./pages/Login.js";
import Dashboard from "./pages/Dashboard.js";
import Insights from "./pages/Insights.js";
import Meetings from "./pages/Meetings.js";
import MeetingDetail from "./pages/MeetingDetail.js";
import ApprovalScreen from "./pages/ApprovalScreen.js";
import Accounts from "./pages/Accounts.js";
import AccountBriefing from "./pages/AccountBriefing.js";
import ZoomConnect from "./pages/ZoomConnect.js";
import MailboxConnect from "./pages/MailboxConnect.js";
import { ToastStack } from "./components/ToastStack.js";

function RequireAuth({ children }: { children: React.ReactNode }) {
  if (!getToken()) return <Navigate to="/login" replace />;
  return <>{children}</>;
}

// Mirror of RequireAuth: a successful login only flips the `authed` flag (via forceRender),
// it doesn't navigate anywhere — without this, staying on the /login route element after
// login (or landing back on it while already authed) just re-renders the same login form
// forever, which looks like the button does nothing.
function RedirectIfAuthed({ children }: { children: React.ReactNode }) {
  if (getToken()) return <Navigate to="/dashboard" replace />;
  return <>{children}</>;
}

/**
 * Chrome for the signed-in app: nav plus the centred, max-width content column.
 *
 * Login deliberately sits OUTSIDE this as a sibling route rather than inside it. The auth
 * screen paints a full-bleed background, and nesting it in <main> clipped that background
 * to the 900px column — it rendered as a tinted rectangle with hard edges floating on the
 * page canvas, and `min-height: 100vh` inside a padded parent also pushed the page into a
 * needless scroll.
 */
function AppShell({ onLogout }: { onLogout: () => void }) {
  return (
    <>
      {!!getToken() && (
        <nav>
          <span className="brand">
            <img src="/logo.png" alt="Tru Performance" />
          </span>
          <NavLink to="/dashboard">Dashboard</NavLink>
          <NavLink to="/insights">Insights</NavLink>
          <NavLink to="/meetings">Meetings</NavLink>
          <NavLink to="/accounts">Accounts</NavLink>
          <NavLink to="/zoom">Zoom</NavLink>
          <NavLink to="/mailbox">Mailbox</NavLink>
          <span className="spacer" />
          <button onClick={onLogout}>Log out</button>
        </nav>
      )}
      <main>
        <Outlet />
      </main>
    </>
  );
}

export default function App() {
  const [, forceRender] = useState(0);
  const authed = !!getToken();
  const rerender = () => forceRender((n) => n + 1);

  return (
    <>
      <Routes>
        <Route
          path="/login"
          element={
            <RedirectIfAuthed>
              <Login onLoggedIn={rerender} />
            </RedirectIfAuthed>
          }
        />
        <Route
          element={
            <AppShell
              onLogout={() => {
                clearToken();
                rerender();
              }}
            />
          }
        >
          <Route path="/dashboard" element={<RequireAuth><Dashboard /></RequireAuth>} />
          <Route path="/insights" element={<RequireAuth><Insights /></RequireAuth>} />
          <Route path="/meetings" element={<RequireAuth><Meetings /></RequireAuth>} />
          <Route path="/meetings/:id" element={<RequireAuth><MeetingDetail /></RequireAuth>} />
          <Route path="/meetings/:id/approval" element={<RequireAuth><ApprovalScreen /></RequireAuth>} />
          <Route path="/accounts" element={<RequireAuth><Accounts /></RequireAuth>} />
          <Route path="/accounts/:id/briefing" element={<RequireAuth><AccountBriefing /></RequireAuth>} />
          <Route path="/zoom" element={<RequireAuth><ZoomConnect /></RequireAuth>} />
          <Route path="/mailbox" element={<RequireAuth><MailboxConnect /></RequireAuth>} />
          <Route path="*" element={<Navigate to={authed ? "/dashboard" : "/login"} replace />} />
        </Route>
      </Routes>
      <ToastStack />
    </>
  );
}
