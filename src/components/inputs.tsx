/* -.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.
 * File Name   : inputs.tsx
 * Created at  : 2026-07-02
 * Updated at  : 2026-07-02
 * Author      : autopilot
 * Purpose     : Styled replacements for the browser-native <select> and
 *               <input type="date"> — every dropdown and date field in the
 *               app goes through these so the controls match the design
 *               system instead of the OS widgets.
 * Description :
.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.*/
import {useLayoutEffect, useEffect, useRef, useState} from "react";
import {createPortal} from "react-dom";

export interface SelectOption {
  value: string | number;
  label: string;
}

// The menu lives in a body portal, so "outside" means outside BOTH the
// trigger and the floating menu. Page scroll/resize closes the popover
// instead of leaving it hanging at a stale fixed position.
function useOutsideClose(
  open: boolean,
  close: () => void,
  refs: Array<React.RefObject<HTMLDivElement>>,
) {
  useEffect(() => {
    if (!open) return;
    const inside = (t: EventTarget | null) =>
      refs.some((r) => r.current && r.current.contains(t as Node));
    function onDown(e: MouseEvent) {
      if (!inside(e.target)) close();
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") close();
    }
    function onScroll(e: Event) {
      if (!inside(e.target)) close();
    }
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    window.addEventListener("scroll", onScroll, true);
    window.addEventListener("resize", close);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
      window.removeEventListener("scroll", onScroll, true);
      window.removeEventListener("resize", close);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, close]);
}

// Fixed-position style for a popover anchored to the trigger. Rendering into
// a body portal means no ancestor's overflow:hidden can clip the menu (which
// used to cut dropdowns off inside cards). Flips above when the space below
// the trigger can't fit the estimated menu height.
function usePopoverStyle(
  open: boolean,
  triggerRef: React.RefObject<HTMLDivElement>,
  estHeight: number,
): React.CSSProperties | null {
  const [style, setStyle] = useState<React.CSSProperties | null>(null);
  useLayoutEffect(() => {
    if (!open) {
      setStyle(null);
      return;
    }
    const el = triggerRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const spaceBelow = window.innerHeight - r.bottom;
    const up = spaceBelow < estHeight + 12 && r.top > spaceBelow;
    setStyle({
      position : "fixed",
      left     : Math.max(8, Math.min(r.left, window.innerWidth - r.width - 8)),
      minWidth : r.width,
      maxWidth : "calc(100vw - 16px)",
      ...(up
        ? {top: "auto", bottom: window.innerHeight - r.top + 4}
        : {top: r.bottom + 4}),
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, estHeight]);
  return style;
}

export function Select(props: {
  value: string | number;
  onChange: (value: string) => void;
  options: SelectOption[];
  disabled?: boolean;
  title?: string;
  style?: React.CSSProperties;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const [highlight, setHighlight] = useState(-1);
  const ref = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  useOutsideClose(open, () => setOpen(false), [ref, menuRef]);
  const menuStyle = usePopoverStyle(open, ref,
    Math.min(280, props.options.length * 34 + 10));

  const selectedIdx = props.options.findIndex(
    (o) => String(o.value) === String(props.value));
  const selected = props.options[selectedIdx];

  function choose(idx: number) {
    const opt = props.options[idx];
    if (!opt) return;
    props.onChange(String(opt.value));
    setOpen(false);
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (props.disabled) return;
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      if (open && highlight >= 0) choose(highlight);
      else {
        setHighlight(selectedIdx);
        setOpen((v) => !v);
      }
    } else if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      if (!open) {
        setHighlight(selectedIdx);
        setOpen(true);
        return;
      }
      const dir = e.key === "ArrowDown" ? 1 : -1;
      setHighlight((h) => {
        const n = props.options.length;
        return ((h < 0 ? selectedIdx : h) + dir + n) % n;
      });
    }
  }

  return (
    <div ref={ref} className={`select ${props.className ?? ""}`}
      style={props.style} title={props.title}>
      <button type="button"
        className="form-input select-trigger"
        disabled={props.disabled}
        aria-haspopup="listbox"
        aria-expanded={open}
        onKeyDown={onKeyDown}
        onClick={() => {
          setHighlight(selectedIdx);
          setOpen((v) => !v);
        }}>
        <span className={selected ? "" : "select-placeholder"}>
          {selected?.label ?? "—"}
        </span>
        <span className={`select-chevron${open ? " open" : ""}`}>▾</span>
      </button>
      {open && menuStyle && createPortal(
        <div className="select-menu" role="listbox" ref={menuRef}
          style={menuStyle}>
          {props.options.map((o, i) => (
            <div key={String(o.value)}
              role="option"
              aria-selected={i === selectedIdx}
              className={`select-option${
                i === selectedIdx ? " selected" : ""}${
                i === highlight ? " highlight" : ""}`}
              onMouseEnter={() => setHighlight(i)}
              onClick={() => choose(i)}>
              {o.label}
              {i === selectedIdx && <span className="select-check">✓</span>}
            </div>
          ))}
        </div>,
        document.body
      )}
    </div>
  );
}

/* ── DateInput ───────────────────────────────────────────────────────────── */

const WEEKDAYS = ["Да", "Мя", "Лх", "Пү", "Ба", "Бя", "Ня"];
const MONTHS = [
  "1-р сар", "2-р сар", "3-р сар", "4-р сар", "5-р сар", "6-р сар",
  "7-р сар", "8-р сар", "9-р сар", "10-р сар", "11-р сар", "12-р сар",
];

function toIso(y: number, m: number, d: number): string {
  return `${y}-${String(m + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

export function DateInput(props: {
  value: string; // "YYYY-MM-DD" or ""
  onChange: (value: string) => void;
  placeholder?: string;
  style?: React.CSSProperties;
  title?: string;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  useOutsideClose(open, () => setOpen(false), [ref, menuRef]);
  const menuStyle = usePopoverStyle(open, ref, 330);

  const parsed = /^\d{4}-\d{2}-\d{2}$/.test(props.value)
    ? new Date(`${props.value}T00:00:00`) : null;
  const today = new Date();
  const [viewYear, setViewYear] = useState(
    (parsed ?? today).getFullYear());
  const [viewMonth, setViewMonth] = useState(
    (parsed ?? today).getMonth());

  function openCalendar() {
    const base = parsed ?? today;
    setViewYear(base.getFullYear());
    setViewMonth(base.getMonth());
    setOpen((v) => !v);
  }

  function shiftMonth(dir: number) {
    let m = viewMonth + dir;
    let y = viewYear;
    if (m < 0) { m = 11; y--; }
    if (m > 11) { m = 0; y++; }
    setViewMonth(m);
    setViewYear(y);
  }

  // Monday-first day-of-week offset of the 1st of the viewed month.
  const firstDow = (new Date(viewYear, viewMonth, 1).getDay() + 6) % 7;
  const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
  const cells: Array<number | null> = [
    ...Array.from({length: firstDow}, () => null),
    ...Array.from({length: daysInMonth}, (_, i) => i + 1),
  ];
  const todayIso = toIso(
    today.getFullYear(), today.getMonth(), today.getDate());

  return (
    <div ref={ref} className="select" style={props.style} title={props.title}>
      <button type="button" className="form-input select-trigger"
        onClick={openCalendar}>
        <span className={props.value ? "" : "select-placeholder"}>
          {props.value || props.placeholder || "Огноо сонгох"}
        </span>
        <span className="select-chevron">📅</span>
      </button>
      {open && menuStyle && createPortal(
        <div className="select-menu datepicker" ref={menuRef}
          style={menuStyle}>
          <div className="datepicker-head">
            <button type="button" className="datepicker-nav"
              onClick={() => shiftMonth(-1)}>‹</button>
            <span className="datepicker-title">
              {viewYear} · {MONTHS[viewMonth]}
            </span>
            <button type="button" className="datepicker-nav"
              onClick={() => shiftMonth(1)}>›</button>
          </div>
          <div className="datepicker-grid">
            {WEEKDAYS.map((w) => (
              <div key={w} className="datepicker-weekday">{w}</div>
            ))}
            {cells.map((d, i) => {
              if (d === null) return <div key={`e${i}`} />;
              const iso = toIso(viewYear, viewMonth, d);
              return (
                <button type="button" key={iso}
                  className={`datepicker-day${
                    iso === props.value ? " selected" : ""}${
                    iso === todayIso ? " today" : ""}`}
                  onClick={() => {
                    props.onChange(iso);
                    setOpen(false);
                  }}>
                  {d}
                </button>
              );
            })}
          </div>
          <div className="datepicker-foot">
            <button type="button" className="datepicker-action"
              onClick={() => {
                props.onChange(todayIso);
                setOpen(false);
              }}>
              ӨНӨӨДӨР
            </button>
            <button type="button" className="datepicker-action"
              onClick={() => {
                props.onChange("");
                setOpen(false);
              }}>
              ЦЭВЭРЛЭХ
            </button>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}
