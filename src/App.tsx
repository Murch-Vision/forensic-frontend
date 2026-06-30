/* -.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.
 * File Name   : App.tsx
 * Created at  : 2026-06-23
 * Updated at  : 2026-06-23
 * Author      : jeefo
 * Purpose     :
 * Description :
.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.*/
import {NavLink, Navigate, Route, Routes} from "react-router-dom";
import SuspectsPage from "./pages/SuspectsPage";
import DashboardPage from "./pages/DashboardPage";
import ImportPage from "./pages/ImportPage";
import TransactionsPage from "./pages/TransactionsPage";
import CallRecordsPage from "./pages/CallRecordsPage";
import TimelinePage from "./pages/TimelinePage";
import LinkChartPage from "./pages/LinkChartPage";
import IntelBoardPage from "./pages/IntelBoardPage";
import MapPage from "./pages/MapPage";
import AnalysisPage from "./pages/AnalysisPage";
import OsintPage from "./pages/OsintPage";
import AuditLogPage from "./pages/AuditLogPage";
import ReportsPage from "./pages/ReportsPage";
import SettingsPage from "./pages/SettingsPage";
import FraudWorkflowPage from "./pages/FraudWorkflowPage";

// Navigation mirrors the Blazor page set; every page is ported.
const NAV = [
  {path: "/dashboard", label: "Хяналтын самбар", icon: "\u{1F4CA}",
    el: <DashboardPage />},
  {path: "/suspects", label: "Хувийн мэдээлэл", icon: "\u{1F471}",
    el: <SuspectsPage />},
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
  {path: "/intelboard", label: "Мэдээллийн самбар", icon: "\u{1F4CB}",
    el: <IntelBoardPage />},
  {path: "/map", label: "Газрын зураг", icon: "\u{1F5FA}",
    el: <MapPage />},
  {path: "/analysis", label: "Шинжилгээ", icon: "\u{1F50D}",
    el: <AnalysisPage />},
  {path: "/fraud", label: "Залилангийн урсгал", icon: "\u{1F6E1}",
    el: <FraudWorkflowPage />},
  {path: "/osint", label: "OSINT", icon: "\u{1F30D}",
    el: <OsintPage />},
  {path: "/audit", label: "Аудит", icon: "\u{1F4DC}",
    el: <AuditLogPage />},
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
      <main style={{flex: 1, overflow: "hidden"}}>
        <Routes>
          <Route path="/" element={<Navigate to="/dashboard" replace />} />
          {NAV.map((n) => (
            <Route key={n.path} path={n.path} element={n.el} />
          ))}
        </Routes>
      </main>
    </div>
  );
}
