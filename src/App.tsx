/* -.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.
 * File Name   : App.tsx
 * Created at  : 2026-06-23
 * Updated at  : 2026-06-23
 * Author      : jeefo
 * Purpose     :
 * Description :
.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.*/
import {NavLink, Navigate, Route, Routes} from "react-router-dom";
import AppHeader from "./components/AppHeader";
import PeoplePage from "./pages/PeoplePage";
import DashboardPage from "./pages/DashboardPage";
import ImportPage from "./pages/ImportPage";
import TransactionsPage from "./pages/TransactionsPage";
import CallRecordsPage from "./pages/CallRecordsPage";
import TimelinePage from "./pages/TimelinePage";
import LinkChartPage from "./pages/LinkChartPage";
import ReportsPage from "./pages/ReportsPage";
import SettingsPage from "./pages/SettingsPage";
import FraudWorkflowPage from "./pages/FraudWorkflowPage";

// Case-centric page set: the analyst works inside the case picked in the
// global AppHeader; every page below follows that session.
const NAV = [
  {path: "/dashboard", label: "Хяналтын самбар", icon: "\u{1F4CA}",
    el: <DashboardPage />},
  {path: "/people", label: "Хүмүүсийн сан", icon: "\u{1F465}",
    el: <PeoplePage />},
  {path: "/import", label: "Өгөгдөл импорт", icon: "\u{1F4E5}",
    el: <ImportPage />},
  {path: "/transactions", label: "Гүйлгээ", icon: "\u{1F4B0}",
    el: <TransactionsPage />},
  {path: "/calls", label: "Дуудлагын бүртгэл", icon: "\u{1F4DE}",
    el: <CallRecordsPage />},
  {path: "/timeline", label: "Он цагийн хэлхээ", icon: "\u{23F1}",
    el: <TimelinePage />},
  {path: "/linkchart", label: "Холбоосын зураглал", icon: "\u{1F578}",
    el: <LinkChartPage />},
  {path: "/fraud", label: "Залилангийн урсгал", icon: "\u{1F6E1}",
    el: <FraudWorkflowPage />},
  {path: "/reports", label: "Тайлан", icon: "\u{1F4C4}",
    el: <ReportsPage />},
  {path: "/settings", label: "Тохиргоо", icon: "\u{2699}",
    el: <SettingsPage />},
];

export default function App() {
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
            padding: "16px 18px",
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
