import { NavLink, Navigate, Route, Routes } from "react-router-dom";
import { useState } from "react";
import { getToken, clearToken } from "./lib/api.js";
import Login from "./pages/Login.js";
import Dashboard from "./pages/Dashboard.js";
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

export default function App() {
  const [, forceRender] = useState(0);
  const authed = !!getToken();

  return (
    <>
      {authed && (
        <nav>
          <strong>Zoom Relationship Intelligence</strong>
          <NavLink to="/dashboard">Dashboard</NavLink>
          <NavLink to="/meetings">Meetings</NavLink>
          <NavLink to="/accounts">Accounts</NavLink>
          <NavLink to="/zoom">Zoom</NavLink>
          <NavLink to="/mailbox">Mailbox</NavLink>
          <span className="spacer" />
          <button
            onClick={() => {
              clearToken();
              forceRender((n) => n + 1);
            }}
          >
            Log out
          </button>
        </nav>
      )}
      <main>
        <Routes>
          <Route path="/login" element={<RedirectIfAuthed><Login onLoggedIn={() => forceRender((n) => n + 1)} /></RedirectIfAuthed>} />
          <Route path="/dashboard" element={<RequireAuth><Dashboard /></RequireAuth>} />
          <Route path="/meetings" element={<RequireAuth><Meetings /></RequireAuth>} />
          <Route path="/meetings/:id" element={<RequireAuth><MeetingDetail /></RequireAuth>} />
          <Route path="/meetings/:id/approval" element={<RequireAuth><ApprovalScreen /></RequireAuth>} />
          <Route path="/accounts" element={<RequireAuth><Accounts /></RequireAuth>} />
          <Route path="/accounts/:id/briefing" element={<RequireAuth><AccountBriefing /></RequireAuth>} />
          <Route path="/zoom" element={<RequireAuth><ZoomConnect /></RequireAuth>} />
          <Route path="/mailbox" element={<RequireAuth><MailboxConnect /></RequireAuth>} />
          <Route path="*" element={<Navigate to={authed ? "/dashboard" : "/login"} replace />} />
        </Routes>
      </main>
      <ToastStack />
    </>
  );
}
