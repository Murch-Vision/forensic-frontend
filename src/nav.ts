/* -.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.
 * File Name   : nav.ts
 * Created at  : 2026-07-02
 * Updated at  : 2026-07-02
 * Author      : jeefo
 * Purpose     :
 * Description :
.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.*/

// Single source of truth for the page hierarchy: the sidebar (App.tsx) and
// the AppHeader breadcrumb both read from this list.

export interface NavMeta {
  path: string;
  label: string;
  icon: string;
}

export const NAV_META: NavMeta[] = [
  {path: "/cases", label: "Кейсүүд", icon: "\u{1F4C1}"},
  {path: "/dashboard", label: "Хяналтын самбар", icon: "\u{1F4CA}"},
  {path: "/people", label: "Хүмүүсийн сан", icon: "\u{1F465}"},
  {path: "/import", label: "Өгөгдөл импорт", icon: "\u{1F4E5}"},
  {path: "/transactions", label: "Гүйлгээ", icon: "\u{1F4B0}"},
  {path: "/calls", label: "Дуудлагын бүртгэл", icon: "\u{1F4DE}"},
  {path: "/timeline", label: "Он цагийн хэлхээ", icon: "\u{23F1}"},
  {path: "/linkchart", label: "Холбоосын зураглал", icon: "\u{1F578}"},
  {path: "/fraud", label: "Залилангийн урсгал", icon: "\u{1F6E1}"},
  {path: "/reports", label: "Тайлан", icon: "\u{1F4C4}"},
  {path: "/settings", label: "Тохиргоо", icon: "\u{2699}"},
];

export const STATUS_LABELS: Record<string, string> = {
  OPEN: "Нээлттэй",
  ACTIVE: "Идэвхтэй",
  CLOSED: "Хаагдсан",
  ARCHIVED: "Архивлагдсан",
  UNKNOWN: "Тодорхойгүй",
};

// Maps CaseStatus onto the badge accents defined in app.css.
export const STATUS_BADGE: Record<string, string> = {
  OPEN: "info",
  ACTIVE: "low",
  CLOSED: "unknown",
  ARCHIVED: "warning",
  UNKNOWN: "unknown",
};
