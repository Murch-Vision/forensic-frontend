/* -.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.
 * File Name   : App.tsx
 * Created at  : 2026-06-23
 * Updated at  : 2026-06-23
 * Author      : jeefo
 * Purpose     :
 * Description :
.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.*/
import {NavLink, Navigate, Route, Routes} from "react-router-dom";
import type {ReactNode} from "react";
import AppHeader from "./components/AppHeader";
import {NAV_META} from "./nav";
import CasesPage from "./pages/CasesPage";
import PeoplePage from "./pages/PeoplePage";
import DashboardPage from "./pages/DashboardPage";
import ImportPage from "./pages/ImportPage";
import TransactionsPage from "./pages/TransactionsPage";
import CallRecordsPage from "./pages/CallRecordsPage";
import TimelinePage from "./pages/TimelinePage";
import LinkChartPage from "./pages/LinkChartPage";
import ReportsPage from "./pages/ReportsPage";
import SettingsPage from "./pages/SettingsPage";
import AdminPage from "./pages/AdminPage";
import LoginPage from "./pages/LoginPage";
import {useAuth} from "./lib/auth";

// Case-centric page set: /cases is the hierarchy root (case management);
// every other page works inside the case picked in the global AppHeader.
// Labels/paths live in nav.ts, shared with the AppHeader breadcrumb.
const PAGE_ELEMENTS: Record<string, ReactNode> = {
  "/cases": <CasesPage />,
  "/dashboard": <DashboardPage />,
  "/people": <PeoplePage />,
  "/import": <ImportPage />,
  "/transactions": <TransactionsPage />,
  "/calls": <CallRecordsPage />,
  "/timeline": <TimelinePage />,
  "/linkchart": <LinkChartPage />,
  "/reports": <ReportsPage />,
  "/settings": <SettingsPage />,
  "/admin": <AdminPage />,
};

// The admin control room is only in the sidebar for the boss; the route itself
// also self-guards (renders a "no access" notice for non-admins).
const ADMIN_NAV = {path: "/admin", label: "Удирдлага", icon: "\u{1F6E1}"};

export default function App() {
  const {user, loading} = useAuth();

  // Resolving the stored token — hold the layout so pages don't flash.
  if (loading) {
    return (
      <div style={{height: "100vh", display: "flex", alignItems: "center",
        justifyContent: "center", color: "var(--text-secondary)"}}>
        Ачааллаж байна…
      </div>
    );
  }
  // No session → the whole app is the login screen.
  if (!user) return <LoginPage />;

  const nav = user.role === "ADMIN"
    ? [...NAV_META, ADMIN_NAV] : NAV_META;
  const NAV = nav.map((n) => ({...n, el: PAGE_ELEMENTS[n.path]}));

  return (
    <div style={{display: "flex", height: "100vh"}}>
      <nav
        style={{
          width: 220,
          background: "var(--bg-sidebar)",
          borderRight: "1px solid var(--border-primary)",
          display: "flex",
          flexDirection: "column",
          overflowY: "auto",
        }}
      >
        <div
          style={{
            // Same height as the app header so the two top bars align.
            height: "var(--app-header-h)",
            flexShrink: 0,
            display: "flex",
            alignItems: "center",
            padding: "0 18px",
            fontWeight: 700,
            fontSize: 13,
            color: "var(--accent-cyan)",
            letterSpacing: 1,
            borderBottom: "1px solid var(--border-primary)",
          }}
        >
          FORENSIC ANALYST
        </div>
        {NAV.map((n) => (
          <NavLink
            key={n.path}
            to={n.path}
            style={({isActive}) => ({
              display: "flex",
              alignItems: "center",
              gap: 10,
              padding: "10px 18px",
              fontSize: 12,
              textDecoration: "none",
              color: isActive ? "var(--accent-cyan)" : "var(--text-secondary)",
              background: isActive ? "rgba(0,229,255,0.06)" : "transparent",
              borderLeft: isActive
                ? "3px solid var(--accent-cyan)"
                : "3px solid transparent",
            })}
          >
            <span>{n.icon}</span>
            <span>{n.label}</span>
          </NavLink>
        ))}
      </nav>
      <div style={{flex: 1, display: "flex", flexDirection: "column", minWidth: 0}}>
        <AppHeader />
        <main style={{flex: 1, overflow: "hidden", minHeight: 0}}>
          <Routes>
            <Route path="/" element={<Navigate to="/dashboard" replace />} />
            <Route path="/suspects"
              element={<Navigate to="/people" replace />} />
            {NAV.map((n) => (
              <Route key={n.path} path={n.path} element={n.el} />
            ))}
            <Route path="*" element={<Navigate to="/dashboard" replace />} />
          </Routes>
        </main>
      </div>
    </div>
  );
}
