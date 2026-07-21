// India Standard Time helpers. ICKU serves an India-only company; all
// user-facing times (checklist deadlines, task due times, meeting times) are
// wall-clock IST. IST is UTC+5:30 with NO DST, so we do explicit offset math —
// never local setHours/getHours — which is correct regardless of the server's
// timezone (Render runs in UTC; dev Macs in IST). A local-time approach passes
// in dev and silently breaks in prod.
export const IST_OFFSET_MS = 330 * 60000;

// The IST wall-clock parts of an instant.
export function istParts(now) {
  const s = new Date(now.getTime() + IST_OFFSET_MS); // shift, then read via UTC getters
  return { y: s.getUTCFullYear(), mo: s.getUTCMonth(), d: s.getUTCDate(), dow: s.getUTCDay(), h: s.getUTCHours(), mi: s.getUTCMinutes() };
}

// The absolute instant of a given IST wall-clock date + time. Date.UTC normalises
// day over/underflow, so callers can pass e.g. d + delta freely.
export const istInstant = (y, mo, d, h = 0, mi = 0) => new Date(Date.UTC(y, mo, d, h, mi, 0) - IST_OFFSET_MS);

// [start, end) instants bounding an IST calendar month (month is 1–12).
export const istMonthRange = (year, month) => ({
  start: istInstant(year, month - 1, 1),
  end: istInstant(year, month, 1), // exclusive — first instant of the next month
});
