import React, { useState, useEffect, useRef } from "react";
import "./InteractiveControls.css";

const MONTH_NAMES = [
  "Enero",
  "Febrero",
  "Marzo",
  "Abril",
  "Mayo",
  "Junio",
  "Julio",
  "Agosto",
  "Septiembre",
  "Octubre",
  "Noviembre",
  "Diciembre",
];

const WEEKDAY_HEADERS = ["L", "M", "M", "J", "V", "S", "D"];

/**
 * Format local Date object to YYYY-MM-DD string without timezone drift
 */
function toLocalISOString(date) {
  if (!date || isNaN(date.getTime())) return "";
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/**
 * Parse YYYY-MM-DD string into local Date object
 */
function parseLocalDate(str) {
  if (!str || typeof str !== "string") return null;
  const parts = str.split("-");
  if (parts.length !== 3) return null;
  const y = parseInt(parts[0], 10);
  const m = parseInt(parts[1], 10) - 1;
  const d = parseInt(parts[2], 10);
  if (isNaN(y) || isNaN(m) || isNaN(d)) return null;
  const date = new Date(y, m, d);
  if (date.getFullYear() !== y || date.getMonth() !== m || date.getDate() !== d) {
    return null;
  }
  return date;
}

export default function DynamicDatePicker({
  value = "",
  onChange,
  label,
  placeholder = "YYYY-MM-DD",
  disabled = false,
  min,
  max,
  align = "left",
  showPresets = true,
  className = "",
  style = {},
  id,
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [typedText, setTypedText] = useState(value || "");

  // Calendar view state
  const initialDate = parseLocalDate(value) || new Date();
  const [viewYear, setViewYear] = useState(initialDate.getFullYear());
  const [viewMonth, setViewMonth] = useState(initialDate.getMonth());

  const containerRef = useRef(null);
  const inputRef = useRef(null);

  // Sync typed text when value changes from outside
  useEffect(() => {
    setTypedText(value || "");
    const parsed = parseLocalDate(value);
    if (parsed) {
      setViewYear(parsed.getFullYear());
      setViewMonth(parsed.getMonth());
    }
  }, [value]);

  // Outside click listener & Escape key
  useEffect(() => {
    const handleOutsideClick = (e) => {
      if (containerRef.current && !containerRef.current.contains(e.target)) {
        setIsOpen(false);
      }
    };

    const handleKeyDown = (e) => {
      if (e.key === "Escape" && isOpen) {
        setIsOpen(false);
      }
    };

    if (isOpen) {
      document.addEventListener("mousedown", handleOutsideClick);
      document.addEventListener("keydown", handleKeyDown);
    }
    return () => {
      document.removeEventListener("mousedown", handleOutsideClick);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [isOpen]);

  // Handle elastic keyboard typing (permits free typing & backspacing)
  const handleInputChange = (e) => {
    const raw = e.target.value;
    // Allow digits, dashes, and empty
    const sanitized = raw.replace(/[^0-9-]/g, "");
    setTypedText(sanitized);

    // If matches full YYYY-MM-DD, parse and notify parent
    if (/^\d{4}-\d{2}-\d{2}$/.test(sanitized)) {
      const parsed = parseLocalDate(sanitized);
      if (parsed) {
        setViewYear(parsed.getFullYear());
        setViewMonth(parsed.getMonth());
        if (onChange) onChange(sanitized, e);
      }
    } else if (sanitized === "") {
      if (onChange) onChange("", e);
    }
  };

  const handleInputBlur = () => {
    // If not a valid date on blur, revert or keep if empty
    if (typedText && !parseLocalDate(typedText)) {
      if (value) {
        setTypedText(value);
      }
    }
  };

  // Day Selection
  const handleDaySelect = (year, month, day) => {
    const selected = new Date(year, month, day);
    const iso = toLocalISOString(selected);
    setTypedText(iso);
    setViewYear(year);
    setViewMonth(month);
    setIsOpen(false);
    if (onChange) onChange(iso);
  };

  // Presets Handlers
  const handlePreset = (type) => {
    const base = parseLocalDate(value) || new Date();
    let target = new Date();

    if (type === "today") {
      target = new Date();
    } else if (type === "startOfMonth") {
      target = new Date(base.getFullYear(), base.getMonth(), 1);
    } else if (type === "+30d") {
      target = new Date(base.getTime() + 30 * 24 * 60 * 60 * 1000);
    } else if (type === "+90d") {
      target = new Date(base.getTime() + 90 * 24 * 60 * 60 * 1000);
    } else if (type === "+360d") {
      target = new Date(base.getTime() + 360 * 24 * 60 * 60 * 1000);
    }

    const iso = toLocalISOString(target);
    setTypedText(iso);
    setViewYear(target.getFullYear());
    setViewMonth(target.getMonth());
    setIsOpen(false);
    if (onChange) onChange(iso);
  };

  // Navigation handlers
  const prevMonth = () => {
    if (viewMonth === 0) {
      setViewMonth(11);
      setViewYear((y) => y - 1);
    } else {
      setViewMonth((m) => m - 1);
    }
  };

  const nextMonth = () => {
    if (viewMonth === 11) {
      setViewMonth(0);
      setViewYear((y) => y + 1);
    } else {
      setViewMonth((m) => m + 1);
    }
  };

  // Compute Days for the Calendar Grid
  const renderCalendarDays = () => {
    const firstDayOfMonth = new Date(viewYear, viewMonth, 1);
    // getDay(): 0 is Sunday, 1 is Monday ... convert to Monday=0, Sunday=6
    let startDayOfWeek = firstDayOfMonth.getDay() - 1;
    if (startDayOfWeek === -1) startDayOfWeek = 6;

    const daysInCurrentMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
    const daysInPrevMonth = new Date(viewYear, viewMonth, 0).getDate();

    const todayIso = toLocalISOString(new Date());
    const selectedIso = value;

    const cells = [];

    // Prev month days
    for (let i = startDayOfWeek - 1; i >= 0; i--) {
      const d = daysInPrevMonth - i;
      const prevM = viewMonth === 0 ? 11 : viewMonth - 1;
      const prevY = viewMonth === 0 ? viewYear - 1 : viewYear;
      cells.push(
        <button
          key={`prev-${d}`}
          type="button"
          className="datepicker-day-btn other-month"
          onClick={() => handleDaySelect(prevY, prevM, d)}
        >
          {d}
        </button>
      );
    }

    // Current month days
    for (let d = 1; d <= daysInCurrentMonth; d++) {
      const cellDate = new Date(viewYear, viewMonth, d);
      const iso = toLocalISOString(cellDate);
      const isSelected = iso === selectedIso;
      const isToday = iso === todayIso;

      cells.push(
        <button
          key={`curr-${d}`}
          type="button"
          className={`datepicker-day-btn ${isSelected ? "selected" : ""} ${isToday ? "today" : ""}`}
          onClick={() => handleDaySelect(viewYear, viewMonth, d)}
        >
          {d}
        </button>
      );
    }

    // Next month days to complete 35 or 42 grid cells
    const totalFilled = cells.length;
    const totalCells = totalFilled > 35 ? 42 : 35;
    const nextDaysNeeded = totalCells - totalFilled;

    for (let d = 1; d <= nextDaysNeeded; d++) {
      const nextM = viewMonth === 11 ? 0 : viewMonth + 1;
      const nextY = viewMonth === 11 ? viewYear + 1 : viewYear;
      cells.push(
        <button
          key={`next-${d}`}
          type="button"
          className="datepicker-day-btn other-month"
          onClick={() => handleDaySelect(nextY, nextM, d)}
        >
          {d}
        </button>
      );
    }

    return cells;
  };

  const yearsOptions = [];
  const currentYear = new Date().getFullYear();
  for (let y = currentYear - 10; y <= currentYear + 15; y++) {
    yearsOptions.push(y);
  }

  return (
    <div
      ref={containerRef}
      className={`dynamic-datepicker-wrapper interactive-control-base ${className}`}
      style={style}
    >
      <div className={`dynamic-datepicker-input-group ${isOpen ? "active" : ""}`}>
        <input
          ref={inputRef}
          id={id}
          type="text"
          className="dynamic-datepicker-field"
          value={typedText}
          onChange={handleInputChange}
          onBlur={handleInputBlur}
          placeholder={placeholder}
          disabled={disabled}
          maxLength={10}
          autoComplete="off"
        />
        <button
          type="button"
          className="dynamic-datepicker-trigger-btn"
          onClick={() => !disabled && setIsOpen(!isOpen)}
          disabled={disabled}
          title="Abrir calendario"
        >
          📅
        </button>
      </div>

      {/* Floating Glassmorphism Popover */}
      {isOpen && (
        <div className={`dynamic-datepicker-popover ${align === "right" ? "align-right" : ""}`}>
          {/* Header Navigation */}
          <div className="datepicker-header-nav">
            <button type="button" className="datepicker-nav-btn" onClick={prevMonth} title="Mes anterior">
              ‹
            </button>
            <div style={{ display: "flex", gap: 6 }}>
              <select
                className="datepicker-select-control"
                value={viewMonth}
                onChange={(e) => setViewMonth(parseInt(e.target.value, 10))}
              >
                {MONTH_NAMES.map((name, idx) => (
                  <option key={idx} value={idx}>
                    {name}
                  </option>
                ))}
              </select>

              <select
                className="datepicker-select-control"
                value={viewYear}
                onChange={(e) => setViewYear(parseInt(e.target.value, 10))}
              >
                {yearsOptions.map((y) => (
                  <option key={y} value={y}>
                    {y}
                  </option>
                ))}
              </select>
            </div>
            <button type="button" className="datepicker-nav-btn" onClick={nextMonth} title="Mes siguiente">
              ›
            </button>
          </div>

          {/* Weekday Headers */}
          <div className="datepicker-weekdays-grid">
            {WEEKDAY_HEADERS.map((day, i) => (
              <div key={i} className="datepicker-weekday-cell">
                {day}
              </div>
            ))}
          </div>

          {/* Days Grid */}
          <div className="datepicker-days-grid">{renderCalendarDays()}</div>

          {/* Quick Preset Shortcut Chips */}
          {showPresets && (
            <div className="datepicker-presets-container">
              <button
                type="button"
                className="datepicker-preset-chip"
                onClick={() => handlePreset("today")}
              >
                Hoy
              </button>
              <button
                type="button"
                className="datepicker-preset-chip"
                onClick={() => handlePreset("startOfMonth")}
              >
                Inicio Mes
              </button>
              <button
                type="button"
                className="datepicker-preset-chip"
                onClick={() => handlePreset("+30d")}
              >
                +30 Días
              </button>
              <button
                type="button"
                className="datepicker-preset-chip"
                onClick={() => handlePreset("+90d")}
              >
                +90 Días
              </button>
              <button
                type="button"
                className="datepicker-preset-chip"
                onClick={() => handlePreset("+360d")}
              >
                +360 Días
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
