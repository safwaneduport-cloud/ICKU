/**
 * Build an RFC-5545 calendar invite (.ics) for a meeting.
 *
 * Emitted as METHOD:REQUEST so Gmail and Outlook render it as an invitation
 * (RSVP + auto-add to the recipient's calendar), or METHOD:CANCEL to withdraw
 * it. Times are written in real UTC: the meeting stores IST wall-clock, and IST
 * has no DST, so the true instant is that wall time minus 5h30m.
 */
const IST_OFFSET_MIN = 330;

// IST wall-clock (date "YYYY-MM-DD" + time "HH:MM") → real UTC Date.
function istToUtc(date, time) {
  const [y, mo, d] = date.split('-').map(Number);
  const [h, mi] = (time || '10:00').split(':').map((n) => parseInt(n, 10) || 0);
  return new Date(Date.UTC(y, mo - 1, d, h, mi) - IST_OFFSET_MIN * 60000);
}

const utcStamp = (dt) => dt.toISOString().replace(/[-:]/g, '').slice(0, 15) + 'Z'; // YYYYMMDDTHHMMSSZ

// Escape per RFC 5545 (\, ; , and newlines are special in TEXT values).
const esc = (s = '') => String(s).replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');

// Fold lines to <=75 octets with CRLF + single space, as the spec requires.
function fold(line) {
  if (line.length <= 75) return line;
  const parts = [];
  let s = line;
  parts.push(s.slice(0, 75));
  s = s.slice(75);
  while (s.length) { parts.push(' ' + s.slice(0, 74)); s = s.slice(74); }
  return parts.join('\r\n');
}

const DOW = ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA'];

// ICKU recurrence → an RRULE line (or null for one-off).
function rrule(m) {
  if (!m.recurring || m.recurring === 'One-off') return null;
  const start = istToUtc(m.date, m.time);
  let rule;
  if (m.recurring === 'Daily') rule = 'FREQ=DAILY';
  else if (m.recurring === 'Weekly') rule = `FREQ=WEEKLY;BYDAY=${DOW[start.getUTCDay()]}`;
  else if (m.recurring === 'Monthly') rule = `FREQ=MONTHLY;BYMONTHDAY=${start.getUTCDate()}`;
  else return null;

  if (m.recurEnd === 'until' && m.recurUntil) {
    const end = istToUtc(m.recurUntil, '23:59');
    rule += `;UNTIL=${utcStamp(end)}`;
  } else if (m.recurEnd === 'count' && m.recurCount) {
    rule += `;COUNT=${m.recurCount}`;
  }
  return `RRULE:${rule}`;
}

/**
 * @param meeting   full Meeting row (title/date/time/durationMin/mode/room/... + meetingLink)
 * @param opts.organizer { name, email }   who the invite comes from
 * @param opts.attendee  { name, email }   the single recipient (marked ATTENDEE)
 * @param opts.method    'REQUEST' | 'CANCEL'
 * @param opts.sequence  integer, bumped on each update so clients accept changes
 * @param opts.locationLabel  human location (room and/or "Microsoft Teams")
 * @param opts.description    body text (agenda, join link, organiser)
 */
export function buildMeetingIcs(meeting, { organizer, attendee, method = 'REQUEST', sequence = 0, locationLabel = '', description = '' }) {
  const start = istToUtc(meeting.date, meeting.time);
  const end = new Date(start.getTime() + (meeting.durationMin || 60) * 60000);
  const cancelled = method === 'CANCEL';

  const lines = [
    'BEGIN:VCALENDAR',
    'PRODID:-//ICKU//Meetings//EN',
    'VERSION:2.0',
    'CALSCALE:GREGORIAN',
    `METHOD:${method}`,
    'BEGIN:VEVENT',
    `UID:meeting-${meeting.id}@icku`,
    `SEQUENCE:${sequence}`,
    `DTSTAMP:${utcStamp(new Date())}`,
    `DTSTART:${utcStamp(start)}`,
    `DTEND:${utcStamp(end)}`,
    `SUMMARY:${esc(meeting.title)}`,
    organizer?.email ? `ORGANIZER;CN=${esc(organizer.name || 'ICKU')}:mailto:${organizer.email}` : null,
    attendee?.email ? `ATTENDEE;CN=${esc(attendee.name || attendee.email)};ROLE=REQ-PARTICIPANT;RSVP=TRUE:mailto:${attendee.email}` : null,
    locationLabel ? `LOCATION:${esc(locationLabel)}` : null,
    description ? `DESCRIPTION:${esc(description)}` : null,
    rrule(meeting),
    `STATUS:${cancelled ? 'CANCELLED' : 'CONFIRMED'}`,
    'END:VEVENT',
    'END:VCALENDAR',
  ].filter(Boolean);

  return lines.map(fold).join('\r\n') + '\r\n';
}
