"use client";

import { useEffect, useMemo, useRef, useState } from "react";

type Parts = { year: number; month: number; day: number; time: string };
type Segments = { year: string; month: string; day: string; hour: string; minute: string };

const PATTERN = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})(?::\d{2})?$/;
const EMPTY: Segments = { year: "", month: "", day: "", hour: "", minute: "" };
const CONTROL_CLASS = "mt-1 h-11 min-h-11 max-h-11 w-full box-border rounded-lg border border-slate-300 bg-white px-3 py-0 text-sm leading-5 text-slate-950 outline-none focus-visible:ring-2 focus-visible:ring-blue-600";

export type SegmentedDateTimeLabels = {
  label: string; help: string; invalid: string; open: string; close: string;
  legend: string; day: string; month: string; year: string; hour: string;
  minute: string; time: string;
};

export function isValidSegmentedDateTime(value: string): boolean {
  const match = PATTERN.exec(value);
  if (!match) return false;
  const [, year, month, day, hour, minute] = match;
  const parsed = new Date(Number(year), Number(month) - 1, Number(day), Number(hour), Number(minute));
  return parsed.getFullYear() === Number(year) && parsed.getMonth() === Number(month) - 1 && parsed.getDate() === Number(day) && parsed.getHours() === Number(hour) && parsed.getMinutes() === Number(minute);
}

function daysInMonth(year: number, month: number) { return new Date(year, month, 0).getDate(); }
function parts(value: string): Parts {
  const match = PATTERN.exec(value);
  if (match && isValidSegmentedDateTime(value)) return { year: Number(match[1]), month: Number(match[2]), day: Number(match[3]), time: `${match[4]}:${match[5]}` };
  const now = new Date();
  return { year: now.getFullYear(), month: now.getMonth() + 1, day: now.getDate(), time: "12:00" };
}
function segments(value: string): Segments {
  const match = PATTERN.exec(value);
  return match ? { year: match[1], month: match[2], day: match[3], hour: match[4], minute: match[5] } : { ...EMPTY };
}
function valueFromParts(value: Parts) { const pad = (part: number) => String(part).padStart(2, "0"); return `${value.year}-${pad(value.month)}-${pad(value.day)} ${value.time}`; }
function valueFromSegments(value: Segments) { return `${value.year}-${value.month}-${value.day} ${value.hour}:${value.minute}`; }

export function SegmentedDateTimePicker({ value, onChange, locale, labels, idPrefix, invalid = !isValidSegmentedDateTime(value) }: {
  value: string; onChange: (value: string) => void; locale: string;
  labels: SegmentedDateTimeLabels; idPrefix: string; invalid?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [pickerParts, setPickerParts] = useState(() => parts(value));
  const [segmentParts, setSegmentParts] = useState(() => segments(value));
  const [lastValue, setLastValue] = useState(value);
  const firstControl = useRef<HTMLSelectElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  const valid = isValidSegmentedDateTime(value);
  if (lastValue !== value) { setLastValue(value); if (valid) { setPickerParts(parts(value)); setSegmentParts(segments(value)); } }
  useEffect(() => { if (open) firstControl.current?.focus(); }, [open]);
  const years = useMemo(() => { const values = Array.from({ length: 101 }, (_, index) => 2000 + index); if (!values.includes(pickerParts.year)) values.push(pickerParts.year); return values.sort((a, b) => a - b); }, [pickerParts.year]);
  const monthFormatter = useMemo(() => new Intl.DateTimeFormat(locale, { month: "long" }), [locale]);
  const helpId = `${idPrefix}-${invalid ? "error" : "help"}`;

  function updateParts(next: Partial<Parts>) {
    const merged = { ...pickerParts, ...next };
    merged.day = Math.min(merged.day, daysInMonth(merged.year, merged.month));
    setPickerParts(merged);
    const nextValue = valueFromParts(merged);
    setSegmentParts(segments(nextValue)); onChange(nextValue);
  }
  function updateSegment(key: keyof Segments, raw: string, input: HTMLInputElement) {
    const length = key === "year" ? 4 : 2;
    const digits = raw.replace(/\D/g, "").slice(0, length);
    const next = { ...segmentParts, [key]: digits };
    let complete = false;
    if (digits.length === length) {
      const number = Number(digits);
      if (key === "year") { complete = number >= 2000 && number <= 2100; next.year = String(Math.min(2100, Math.max(2000, number))); }
      if (key === "month") { complete = number >= 1 && number <= 12; next.month = String(Math.min(12, Math.max(1, number))).padStart(2, "0"); }
      if (key === "hour") { complete = number >= 0 && number <= 23; next.hour = String(Math.min(23, number)).padStart(2, "0"); }
      if (key === "minute") { complete = number >= 0 && number <= 59; next.minute = String(Math.min(59, number)).padStart(2, "0"); }
      if (key === "day") { const maximum = next.year.length === 4 && next.month.length === 2 ? daysInMonth(Number(next.year), Number(next.month)) : 31; complete = number >= 1 && number <= maximum; next.day = String(Math.min(maximum, Math.max(1, number))).padStart(2, "0"); }
    }
    if ((key === "year" || key === "month") && next.year.length === 4 && next.month.length === 2 && next.day.length === 2) next.day = String(Math.min(Number(next.day), daysInMonth(Number(next.year), Number(next.month)))).padStart(2, "0");
    setSegmentParts(next);
    const nextValue = valueFromSegments(next); onChange(nextValue);
    if (isValidSegmentedDateTime(nextValue)) setPickerParts(parts(nextValue));
    if (complete) { const nextKey = key === "day" ? "month" : key === "month" ? "year" : key === "year" ? "hour" : key === "hour" ? "minute" : null; const nextInput = nextKey ? input.closest<HTMLElement>('[role="group"]')?.querySelector<HTMLInputElement>(`[data-segment="${nextKey}"]`) : null; nextInput?.focus(); nextInput?.select(); }
  }
  const segmentProps = (key: keyof Segments, label: string, width: string, placeholder: string) => ({ type: "text", "data-segment": key, inputMode: "numeric" as const, autoComplete: "off", spellCheck: false, value: segmentParts[key], placeholder, "aria-label": label, "aria-invalid": invalid, "aria-describedby": helpId, className: `min-w-0 rounded-sm border border-transparent bg-transparent px-0.5 py-0 text-center font-mono text-base leading-5 tabular-nums text-slate-950 outline-none focus:border-blue-500 focus:bg-blue-50 focus:text-slate-950 ${width}`, onChange: (event: React.ChangeEvent<HTMLInputElement>) => updateSegment(key, event.target.value, event.currentTarget), onFocus: (event: React.FocusEvent<HTMLInputElement>) => event.currentTarget.select(), onClick: (event: React.MouseEvent<HTMLInputElement>) => event.currentTarget.select() });

  return <div>
    <p dir="auto" id={`${idPrefix}-label`} className="text-sm font-semibold text-slate-900">{labels.label}</p>
    <div role="group" aria-labelledby={`${idPrefix}-label`} dir="ltr" className="mt-2 flex min-h-11 w-full max-w-md items-center overflow-x-auto rounded-lg border border-slate-300 bg-white px-3 py-0.5 focus-within:border-blue-600 focus-within:ring-2 focus-within:ring-blue-600">
      <input {...segmentProps("day", labels.day, "w-[3.5ch]", "DD")} /><span aria-hidden="true" className="text-slate-400">/</span><input {...segmentProps("month", labels.month, "w-[3.5ch]", "MM")} /><span aria-hidden="true" className="text-slate-400">/</span><input {...segmentProps("year", labels.year, "w-[5ch]", "YYYY")} /><span aria-hidden="true" className="mr-1 text-slate-400">,</span><input {...segmentProps("hour", labels.hour, "w-[3.5ch]", "HH")} /><span aria-hidden="true" className="text-slate-400">:</span><input {...segmentProps("minute", labels.minute, "w-[3.5ch]", "mm")} />
    </div>
    <p dir="auto" id={helpId} role={invalid ? "alert" : undefined} className={`mt-2 text-sm ${invalid ? "text-rose-800" : "text-slate-600"}`}>{invalid ? labels.invalid : labels.help}</p>
    <button ref={button} type="button" aria-expanded={open} aria-controls={`${idPrefix}-panel`} onClick={() => setOpen((current) => !current)} className="mt-3 min-h-11 rounded-lg border border-blue-300 bg-white px-4 text-sm font-semibold text-blue-800 outline-none hover:bg-blue-50 focus-visible:ring-2 focus-visible:ring-blue-600">{open ? labels.close : labels.open}</button>
    {open ? <fieldset id={`${idPrefix}-panel`} className="mt-3 max-h-[60vh] overflow-y-auto rounded-xl border border-blue-200 bg-white p-4" onKeyDown={(event) => { if (event.key === "Escape") { setOpen(false); button.current?.focus(); } }}><legend dir="auto" className="px-1 text-sm font-semibold text-slate-900">{labels.legend}</legend><div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      <label dir="auto" className="text-sm font-medium text-slate-700">{labels.year}<select ref={firstControl} value={pickerParts.year} onChange={(event) => updateParts({ year: Number(event.target.value) })} className={CONTROL_CLASS}>{years.map((year) => <option key={year} value={year}>{year}</option>)}</select></label>
      <label dir="auto" className="text-sm font-medium text-slate-700">{labels.month}<select value={pickerParts.month} onChange={(event) => updateParts({ month: Number(event.target.value) })} className={CONTROL_CLASS}>{Array.from({ length: 12 }, (_, index) => index + 1).map((month) => <option key={month} value={month}>{monthFormatter.format(new Date(2020, month - 1, 1))}</option>)}</select></label>
      <label dir="auto" className="text-sm font-medium text-slate-700">{labels.day}<select value={pickerParts.day} onChange={(event) => updateParts({ day: Number(event.target.value) })} className={CONTROL_CLASS}>{Array.from({ length: daysInMonth(pickerParts.year, pickerParts.month) }, (_, index) => index + 1).map((day) => <option key={day} value={day}>{day}</option>)}</select></label>
      <label dir="auto" className="text-sm font-medium text-slate-700">{labels.time}<input type="time" value={pickerParts.time} onChange={(event) => updateParts({ time: event.target.value })} className={CONTROL_CLASS} /></label>
    </div></fieldset> : null}
  </div>;
}
