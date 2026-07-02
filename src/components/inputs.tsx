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
import {useEffect, useRef, useState} from "react";

export interface SelectOption {
  value: string | number;
  label: string;
}

function useOutsideClose(
  open: boolean,
  close: () => void,
): React.RefObject<HTMLDivElement> {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    function onDown(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) close();
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") close();
    }
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open, close]);
  return ref;
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
  const ref = useOutsideClose(open, () => setOpen(false));

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
      {open && (
        <div className="select-menu" role="listbox">
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
        </div>
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
  const ref = useOutsideClose(open, () => setOpen(false));

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
      {open && (
        <div className="select-menu datepicker">
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
        </div>
      )}
    </div>
  );
}
