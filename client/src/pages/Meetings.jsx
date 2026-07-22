import { useEffect, useMemo, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '../store/AuthContext.jsx';
import { useProfile } from '../store/ProfileContext.jsx';
import { getUsers } from '../api/users.api.js';
import {
  meetingsMeta, getMeetings, getMeeting, createMeeting, updateMeeting, deleteMeeting,
  updateMinutes, addMeetingAction, toggleMeetingAction,
} from '../api/collab.api.js';
import { getMicrosoftCalendar, getMicrosoftStatus } from '../api/integrations.api.js';
import { getEvents } from '../api/events.api.js';
import { triggerLabel } from '../features/events/meta.js';
import { uploadFile } from '../api/files.api.js';
import AssignPicker from '../features/events/AssignPicker.jsx';

const initials = (n = '') => n.split(' ').map((w) => w[0]).slice(0, 2).join('').toUpperCase();
const isAdmin = (u) => u?.id === 'ceo' || u?.id === 'EP002' || u?.role === 'HR Head';
const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS_FULL = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const pad = (n) => String(n).padStart(2, '0');
const ymd = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const addDays = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
const startOfWeek = (d) => { const x = new Date(d); x.setDate(x.getDate() - x.getDay()); x.setHours(0, 0, 0, 0); return x; };
const fmtDate = (iso) => new Date(`${iso}T00:00:00`).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
const durLabel = (d) => (!d ? '' : d < 60 ? `${d} min` : d % 60 ? `${Math.floor(d / 60)} hr 30 min` : `${d / 60} hr`);
// MS times arrive as IST wall-clock strings ("YYYY-MM-DDTHH:MM:SS").
const msTime = (s) => (s ? s.slice(11, 16) : '');
const minOf = (hhmm) => { const [h, m] = (hhmm || '00:00').split(':').map(Number); return h * 60 + m; };
const msDurationMin = (e) => {
  if (!e?.start || !e?.end) return 60;
  const d = (new Date(e.end.replace(' ', 'T')) - new Date(e.start.replace(' ', 'T'))) / 60000;
  return d > 0 && d < 24 * 60 ? Math.round(d) : 60;
};
// "12–18 July 2026" style label for a week starting at `ws`.
function weekLabel(ws) {
  const we = addDays(ws, 6);
  const sameMonth = ws.getMonth() === we.getMonth();
  const left = sameMonth ? ws.getDate() : `${MONTHS_FULL[ws.getMonth()].slice(0, 3)} ${ws.getDate()}`;
  return `${left}–${we.getDate()} ${MONTHS_FULL[we.getMonth()]} ${we.getFullYear()}`;
}
// True when two [start,end) minute ranges overlap.
const overlaps = (a, b) => a.startMin < b.endMin && b.startMin < a.endMin;

// One shape for both sources so the calendar + list treat them uniformly.
function normalize(icku, ms) {
  // Drop the Outlook copy of any meeting ICKU created in Teams — it's already
  // in the icku list, so showing the mirror too would double it on the calendar.
  const ickuMsIds = new Set(icku.map((m) => m.msEventId).filter(Boolean));
  const rows = [
    ...icku.map((m) => { const time = m.time || '00:00'; const dur = m.durationMin || 60; return {
      kind: 'icku', id: m.id, date: m.date, time, title: m.title,
      durationMin: dur, startMin: minOf(time), endMin: minOf(time) + dur, mine: m.mine,
      sub: `${m.owner.name} · ${m.attendeeCount} attendee${m.attendeeCount === 1 ? '' : 's'}`, tag: m.recurring, m }; }),
    ...ms.filter((e) => !ickuMsIds.has(e.id)).map((e) => { const time = e.allDay ? '00:00' : msTime(e.start); const dur = e.allDay ? 0 : msDurationMin(e); return {
      kind: e.isOnlineMeeting ? 'teams' : 'outlook', id: e.id, date: (e.start || '').slice(0, 10),
      time, title: e.subject, allDay: e.allDay,
      durationMin: dur, startMin: minOf(time), endMin: minOf(time) + dur, mine: true, // your own Outlook/Teams calendar
      sub: e.organizer || e.location || 'Outlook', link: e.joinUrl || e.webLink || '#', e }; }),
  ];
  return rows.sort((a, b) => `${a.date}T${a.time}`.localeCompare(`${b.date}T${b.time}`));
}

const SRC = {
  icku: { c: '#134535', b: '#E4EDE7', label: '' },
  teams: { c: '#4B53BC', b: '#EAF1FB', label: 'Teams' },
  outlook: { c: '#2A6BB5', b: '#E6EFF8', label: 'Outlook' },
};

export default function Meetings() {
  const { user } = useAuth();
  const meta = useQuery({ queryKey: ['meetings-meta'], queryFn: meetingsMeta, retry: false });
  const [view, setView] = useState('week'); // week | calendar (month) | list
  const [cursor, setCursor] = useState(() => { const d = new Date(); return new Date(d.getFullYear(), d.getMonth(), 1); });
  const [weekCursor, setWeekCursor] = useState(() => new Date());
  const [openId, setOpenId] = useState(null);
  const [modal, setModal] = useState(null); // { meeting } for edit, { initialDate } for new, or {} for new
  const [toast, setToast] = useState('');
  useEffect(() => { if (!toast) return; const t = setTimeout(() => setToast(''), 3500); return () => clearTimeout(t); }, [toast]);

  const y = cursor.getFullYear(); const mo = cursor.getMonth();
  const weekStart = useMemo(() => startOfWeek(weekCursor), [weekCursor]);
  // Only meetings you're part of (own or attend) — no org-wide "All" view.
  const list = useQuery({ queryKey: ['meetings', 'mine'], queryFn: () => getMeetings('mine'), retry: false });

  // Pull the signed-in user's own Outlook/Teams calendar for the visible range
  // (a week in week view, otherwise the month).
  const range = view === 'week'
    ? { from: weekStart.toISOString(), to: addDays(weekStart, 7).toISOString(), key: `w${ymd(weekStart)}` }
    : { from: new Date(y, mo, 1).toISOString(), to: new Date(y, mo + 1, 0, 23, 59, 59).toISOString(), key: `m${y}-${mo}` };
  const cal = useQuery({ queryKey: ['ms-calendar', range.key], queryFn: () => getMicrosoftCalendar(range.from, range.to), retry: false, refetchOnWindowFocus: true });
  const msEvents = cal.data?.connected ? (cal.data.events || []) : [];

  const rows = useMemo(() => normalize(list.data || [], msEvents), [list.data, msEvents]);

  const open = (row) => {
    if (row.kind === 'icku') setOpenId(row.id);
    else window.open(row.link, '_blank', 'noopener');
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="font-serif text-3xl font-bold text-pine">Meetings</h1>
        <div className="flex items-center gap-2">
          <div className="flex rounded-lg border border-line bg-white p-0.5">
            {[['week', '▦ Week'], ['calendar', '🗓 Month'], ['list', '☰ List']].map(([v, label]) => (
              <button key={v} onClick={() => setView(v)}
                className={`rounded-md px-3 py-1.5 text-sm font-medium ${view === v ? 'bg-pine text-white' : 'text-ink-soft hover:text-pine'}`}>{label}</button>
            ))}
          </div>
          {meta.data?.canCreate && <button onClick={() => setModal({})} className="rounded-lg bg-pine px-4 py-2 text-sm font-medium text-white">+ New meeting</button>}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {view !== 'list' && (
          <div className="ml-2 flex items-center gap-1">
            <button onClick={() => view === 'week' ? setWeekCursor(addDays(weekStart, -7)) : setCursor(new Date(y, mo - 1, 1))} className="rounded-lg border border-line bg-white px-2.5 py-1.5 text-sm">←</button>
            <span className="min-w-[11rem] text-center text-sm font-medium text-ink">{view === 'week' ? weekLabel(weekStart) : `${MONTHS_FULL[mo]} ${y}`}</span>
            <button onClick={() => view === 'week' ? setWeekCursor(addDays(weekStart, 7)) : setCursor(new Date(y, mo + 1, 1))} className="rounded-lg border border-line bg-white px-2.5 py-1.5 text-sm">→</button>
            <button onClick={() => { const d = new Date(); if (view === 'week') setWeekCursor(d); else setCursor(new Date(d.getFullYear(), d.getMonth(), 1)); }} className="ml-1 rounded-lg border border-line bg-white px-3 py-1.5 text-sm hover:border-pine">Today</button>
          </div>
        )}
        {cal.data?.connected
          ? <span className="ml-auto text-xs text-ink-soft">🗓️ Showing your Outlook / Teams calendar too</span>
          : <a href="/profile" className="ml-auto text-xs text-pine hover:underline">Connect your calendar to see Teams meetings here →</a>}
      </div>

      {view === 'week'
        ? <WeekCalendar weekStart={weekStart} rows={rows} onOpen={open} onNewOn={(date, time) => meta.data?.canCreate && setModal({ initialDate: date, initialTime: time })} />
        : view === 'calendar'
        ? <MonthCalendar year={y} month={mo} rows={rows} onOpen={open} onNewOn={(date) => meta.data?.canCreate && setModal({ initialDate: date })} />
        : <MeetingList rows={rows} loading={list.isLoading} onOpen={open} />}

      {openId && <MeetingDrawer id={openId} onClose={() => setOpenId(null)} onEdit={(m) => { setOpenId(null); setModal({ meeting: m }); }} />}
      {modal && <MeetingModal recurrences={meta.data?.recurrences || []} rooms={meta.data?.rooms || []} meeting={modal.meeting} initialDate={modal.initialDate} initialTime={modal.initialTime} onClose={() => setModal(null)} onToast={setToast} />}

      {toast && <div className="fixed bottom-6 left-1/2 z-[60] -translate-x-1/2 rounded-full bg-pine px-5 py-2.5 text-sm text-white shadow-lg">{toast}</div>}
    </div>
  );
}

// Human-readable tally of who got a calendar invite when a meeting was saved.
function inviteSummary(invited) {
  if (!invited) return '';
  const { sent = 0, failed = 0, skipped = 0 } = invited;
  if (!sent && !failed && !skipped) return '';
  const bits = [sent ? `📧 Invited ${sent} ${sent === 1 ? 'person' : 'people'}` : 'No invites emailed'];
  if (failed) bits.push(`${failed} couldn’t be emailed`);
  if (skipped) bits.push(`${skipped} without an email address`);
  return bits.join(' · ');
}

// Greedy side-by-side layout for a day's timed meetings: transitively-overlapping
// meetings form a cluster and share the column width in lanes (like Teams/Outlook).
function layoutDay(events) {
  const sorted = [...events].sort((a, b) => a.startMin - b.startMin || a.endMin - b.endMin);
  const out = [];
  let i = 0;
  while (i < sorted.length) {
    let clusterEnd = sorted[i].endMin;
    const cluster = [sorted[i]];
    let j = i + 1;
    while (j < sorted.length && sorted[j].startMin < clusterEnd) { cluster.push(sorted[j]); clusterEnd = Math.max(clusterEnd, sorted[j].endMin); j++; }
    const laneEnds = [];
    const placed = cluster.map((ev) => {
      let lane = laneEnds.findIndex((end) => end <= ev.startMin);
      if (lane === -1) { lane = laneEnds.length; laneEnds.push(ev.endMin); } else laneEnds[lane] = ev.endMin;
      return { row: ev, lane };
    });
    for (const p of placed) out.push({ ...p, lanes: laneEnds.length });
    i = j;
  }
  return out;
}

// "8:00 AM" / "8:30 AM" — full AM/PM with minutes, half-hour granularity.
const fmtHM = (mins) => {
  const h = Math.floor(mins / 60), m = mins % 60;
  return `${((h + 11) % 12) + 1}:${String(m).padStart(2, '0')} ${h >= 12 ? 'PM' : 'AM'}`;
};
const pad2 = (n) => String(n).padStart(2, '0');
const GRID_COLS = '4.25rem repeat(7, minmax(0, 1fr))';

// ── Week calendar (Teams-style time grid: 30-min slots down the Y axis) ──
function WeekCalendar({ weekStart, rows, onOpen, onNewOn }) {
  const days = useMemo(() => Array.from({ length: 7 }, (_, i) => addDays(weekStart, i)), [weekStart]);
  const todayStr = ymd(new Date());

  const byDay = useMemo(() => {
    const map = new Map(days.map((d) => [ymd(d), []]));
    for (const r of rows) if (map.has(r.date)) map.get(r.date).push(r);
    return map;
  }, [rows, days]);

  // Flag the signed-in user's own double-bookings: any two of *their* meetings
  // that overlap in time (same idea as Teams' conflict warning).
  const conflictIds = useMemo(() => {
    const set = new Set();
    for (const list of byDay.values()) {
      const mine = list.filter((r) => r.mine && !r.allDay);
      for (let i = 0; i < mine.length; i++)
        for (let j = i + 1; j < mine.length; j++)
          if (overlaps(mine[i], mine[j])) { set.add(mine[i].id); set.add(mine[j].id); }
    }
    return set;
  }, [byDay]);

  // Visible window: 8 AM–9 PM by default (so evening meetings can be created too),
  // widened to fit anything scheduled earlier or later.
  let minH = 8, maxH = 21, hasAllDay = false;
  for (const list of byDay.values()) for (const r of list) {
    if (r.allDay) { hasAllDay = true; continue; }
    minH = Math.min(minH, Math.floor(r.startMin / 60));
    maxH = Math.max(maxH, Math.ceil(r.endMin / 60));
  }
  minH = Math.max(0, minH); maxH = Math.min(24, Math.max(maxH, minH + 1));
  const SLOT = 26; // px per 30 minutes
  const startMin0 = minH * 60;
  const slots = [];
  for (let m = startMin0; m < maxH * 60; m += 30) slots.push(m);
  const gridHeight = slots.length * SLOT;

  return (
    <div className="overflow-hidden rounded-2xl border border-line bg-white">
      <div className="grid border-b border-line" style={{ gridTemplateColumns: GRID_COLS }}>
        <div className="border-r border-line/60" />
        {days.map((d) => {
          const isToday = ymd(d) === todayStr;
          return (
            <div key={ymd(d)} className={`border-r border-line/50 px-1 py-2 text-center last:border-r-0 ${isToday ? 'bg-pine-tint/40' : ''}`}>
              <div className="text-[10px] font-semibold uppercase tracking-wide text-ink-soft">{DOW[d.getDay()]}</div>
              <div className={`mx-auto mt-0.5 flex h-6 w-6 items-center justify-center rounded-full text-sm ${isToday ? 'bg-pine font-bold text-white' : 'text-ink'}`}>{d.getDate()}</div>
            </div>
          );
        })}
      </div>

      {hasAllDay && (
        <div className="grid border-b border-line bg-paper/40" style={{ gridTemplateColumns: GRID_COLS }}>
          <div className="flex items-center justify-end border-r border-line/60 pr-1.5 text-[9px] uppercase text-ink-soft">all-day</div>
          {days.map((d) => (
            <div key={ymd(d)} className="min-h-[1.75rem] space-y-0.5 border-r border-line/50 p-1 last:border-r-0">
              {(byDay.get(ymd(d)) || []).filter((r) => r.allDay).map((r) => (
                <button key={r.id} onClick={() => onOpen(r)} className="block w-full truncate rounded px-1 py-0.5 text-left text-[10px] font-medium hover:opacity-80" style={{ color: SRC[r.kind].c, background: SRC[r.kind].b }}>{r.title}</button>
              ))}
            </div>
          ))}
        </div>
      )}

      <div className="grid" style={{ gridTemplateColumns: GRID_COLS }}>
        <div className="border-r border-line/60">
          {slots.map((m) => (
            <div key={m} className={`relative ${m % 60 === 0 ? 'border-b border-line/40' : 'border-b border-line/20'}`} style={{ height: SLOT }}>
              <span className="absolute -top-2 right-1.5 text-[9px] tabular-nums text-ink-soft">{fmtHM(m)}</span>
            </div>
          ))}
        </div>
        {days.map((d) => {
          const laid = layoutDay((byDay.get(ymd(d)) || []).filter((r) => !r.allDay));
          const isToday = ymd(d) === todayStr;
          return (
            <div key={ymd(d)} className={`relative border-r border-line/50 last:border-r-0 ${isToday ? 'bg-pine-tint/10' : ''}`} style={{ height: gridHeight }}>
              {slots.map((m) => (
                <button key={m} onClick={() => onNewOn?.(ymd(d), `${pad2(Math.floor(m / 60))}:${pad2(m % 60)}`)} tabIndex={-1}
                  className={`block w-full hover:bg-pine-tint/20 ${m % 60 === 0 ? 'border-b border-line/40' : 'border-b border-line/20'}`} style={{ height: SLOT }} aria-label={`New meeting ${ymd(d)} ${fmtHM(m)}`} />
              ))}
              {laid.map(({ row: r, lane, lanes }) => {
                const top = ((r.startMin - startMin0) / 30) * SLOT;
                const height = Math.max(16, (r.durationMin / 30) * SLOT - 2);
                const w = 100 / lanes;
                const conflict = conflictIds.has(r.id);
                const s = SRC[r.kind];
                return (
                  <button key={r.id} onClick={() => onOpen(r)}
                    title={`${r.time} · ${r.title}${conflict ? ' — overlaps another of your meetings' : ''}`}
                    className={`absolute overflow-hidden rounded-md px-1.5 py-0.5 text-left hover:opacity-90 ${conflict ? 'ring-2 ring-brick' : ''}`}
                    style={{ top, height, left: `calc(${lane * w}% + 1px)`, width: `calc(${w}% - 2px)`, background: s.b, color: s.c, borderLeft: `3px solid ${conflict ? '#9C3A2A' : s.c}` }}>
                    <div className="truncate text-[10px] font-semibold leading-tight">{conflict && '⚠ '}{r.title}</div>
                    <div className="truncate text-[9px] leading-tight opacity-70">{r.time}{s.label ? ` · ${s.label}` : ''}</div>
                  </button>
                );
              })}
            </div>
          );
        })}
      </div>

      {conflictIds.size > 0 && (
        <div className="flex items-center gap-2 border-t border-line bg-brick/5 px-3 py-2 text-xs font-medium text-brick">
          <span className="inline-block h-3 w-3 rounded-sm ring-2 ring-brick" /> ⚠ Conflict — you have meetings that overlap in time. The flagged blocks sit side by side.
        </div>
      )}
    </div>
  );
}

// ── Month calendar ──────────────────────────────────────────────────
function MonthCalendar({ year, month, rows, onOpen, onNewOn }) {
  const [selected, setSelected] = useState(null);
  const today = ymd(new Date());
  const byDay = useMemo(() => {
    const map = new Map();
    for (const r of rows) { if (!map.has(r.date)) map.set(r.date, []); map.get(r.date).push(r); }
    return map;
  }, [rows]);

  const lead = new Date(year, month, 1).getDay();
  const days = new Date(year, month + 1, 0).getDate();
  const cells = [...Array(lead).fill(null), ...Array.from({ length: days }, (_, i) => i + 1)];
  while (cells.length % 7) cells.push(null);
  const dayRows = selected ? (byDay.get(selected) || []) : [];

  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_18rem]">
      {/* Phone grid — titles won't fit in a ~45px cell, so days carry dots and
          the agenda panel below does the reading. */}
      <div className="overflow-hidden rounded-2xl border border-line bg-white sm:hidden">
        <div className="grid grid-cols-7 border-b border-line bg-paper/60">
          {DOW.map((d) => <div key={d} className="py-1.5 text-center text-[10px] font-semibold uppercase tracking-wide text-ink-soft">{d[0]}</div>)}
        </div>
        <div className="grid grid-cols-7">
          {cells.map((d, i) => {
            if (!d) return <div key={i} className="aspect-square border-b border-r border-line/50 bg-paper/30" />;
            const date = `${year}-${pad(month + 1)}-${pad(d)}`;
            const items = byDay.get(date) || [];
            const isToday = date === today;
            return (
              <button key={i} onClick={() => setSelected(date)}
                className={`flex aspect-square flex-col items-center justify-center gap-1 border-b border-r border-line/50 ${selected === date ? 'bg-pine-tint/50' : ''}`}>
                <span className={`flex h-6 w-6 items-center justify-center rounded-full text-xs ${isToday ? 'bg-pine font-bold text-white' : 'text-ink'}`}>{d}</span>
                <span className="flex h-1.5 items-center gap-0.5">
                  {items.slice(0, 3).map((r) => (
                    <span key={r.id} className="h-1.5 w-1.5 rounded-full" style={{ background: SRC[r.kind].c }} />
                  ))}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      <div className="hidden overflow-hidden rounded-2xl border border-line bg-white sm:block">
        <div className="grid grid-cols-7 border-b border-line bg-paper/60">
          {DOW.map((d) => <div key={d} className="px-2 py-2 text-center text-[11px] font-semibold uppercase tracking-wide text-ink-soft">{d}</div>)}
        </div>
        <div className="grid grid-cols-7">
          {cells.map((d, i) => {
            if (!d) return <div key={i} className="min-h-[6.5rem] border-b border-r border-line/50 bg-paper/30 last:border-r-0" />;
            const date = `${year}-${pad(month + 1)}-${pad(d)}`;
            const items = (byDay.get(date) || []);
            const isToday = date === today;
            return (
              <button key={i} onClick={() => setSelected(date)}
                className={`min-h-[6.5rem] border-b border-r border-line/50 p-1.5 text-left align-top hover:bg-pine-tint/30 ${selected === date ? 'bg-pine-tint/40' : ''}`}>
                <div className="flex items-center justify-between">
                  <span className={`flex h-6 w-6 items-center justify-center rounded-full text-xs ${isToday ? 'bg-pine font-bold text-white' : 'text-ink-soft'}`}>{d}</span>
                </div>
                <div className="mt-1 space-y-1">
                  {items.slice(0, 3).map((r) => {
                    const s = SRC[r.kind];
                    return (
                      <span key={r.id} role="button" tabIndex={0}
                        onClick={(e) => { e.stopPropagation(); onOpen(r); }}
                        onKeyDown={(e) => { if (e.key === 'Enter') { e.stopPropagation(); onOpen(r); } }}
                        className="block truncate rounded px-1.5 py-0.5 text-[11px] font-medium hover:opacity-80" style={{ color: s.c, background: s.b }}
                        title={`${r.allDay ? '' : r.time + ' '}${r.title}`}>
                        {!r.allDay && <span className="tabular-nums opacity-70">{r.time} </span>}{r.title}
                      </span>
                    );
                  })}
                  {items.length > 3 && <span className="block px-1 text-[10px] text-ink-soft">+{items.length - 3} more</span>}
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* day agenda panel */}
      <aside className="rounded-2xl border border-line bg-white p-3">
        {!selected ? (
          <p className="py-6 text-center text-sm text-ink-soft">Pick a day to see its meetings.</p>
        ) : (
          <>
            <div className="flex items-center justify-between">
              <p className="text-sm font-semibold text-pine">{fmtDate(selected)}</p>
              {onNewOn && <button onClick={() => onNewOn(selected)} className="text-xs font-medium text-pine hover:underline">+ New</button>}
            </div>
            <div className="mt-2 space-y-1.5">
              {dayRows.length === 0 && <p className="py-4 text-center text-xs text-ink-soft">No meetings.</p>}
              {dayRows.map((r) => {
                const s = SRC[r.kind];
                return (
                  <button key={r.id} onClick={() => onOpen(r)} className="block w-full rounded-lg border border-line p-2 text-left hover:border-pine">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs tabular-nums text-ink-soft">{r.allDay ? 'All day' : r.time}</span>
                      {s.label && <span className="rounded px-1.5 py-0.5 text-[10px] font-medium" style={{ color: s.c, background: s.b }}>{s.label} ↗</span>}
                    </div>
                    <div className="truncate text-sm font-medium text-ink">{r.title}</div>
                    <div className="truncate text-[11px] text-ink-soft">{r.sub}</div>
                  </button>
                );
              })}
            </div>
          </>
        )}
      </aside>
    </div>
  );
}

// ── List view ───────────────────────────────────────────────────────
function MeetingList({ rows, loading, onOpen }) {
  return (
    <div className="space-y-3">
      {loading && <p className="text-ink-soft">Loading…</p>}
      {!loading && rows.length === 0 && <p className="text-ink-soft">No meetings.</p>}
      {rows.map((r) => {
        const s = SRC[r.kind];
        return (
          <button key={`${r.kind}-${r.id}`} onClick={() => onOpen(r)} className="flex w-full items-center gap-4 rounded-2xl border border-line bg-white p-4 text-left hover:border-pine">
            <div className="w-16 shrink-0 text-center">
              <div className="text-sm font-semibold">{fmtDate(r.date).split(' ').slice(1).join(' ')}</div>
              <div className="text-xs text-ink-soft">{r.allDay ? 'All day' : r.time}</div>
            </div>
            <div className="min-w-0 flex-1">
              <div className="truncate font-medium">{r.title}</div>
              <div className="truncate text-xs text-ink-soft">{r.sub}</div>
            </div>
            {r.kind === 'icku'
              ? <span className="rounded bg-steel-tint px-2 py-0.5 text-xs font-medium text-steel">{r.tag}</span>
              : <span className="rounded px-2 py-0.5 text-xs font-medium" style={{ color: s.c, background: s.b }}>{s.label} ↗</span>}
          </button>
        );
      })}
    </div>
  );
}

// ── Meeting drawer ──────────────────────────────────────────────────
function MeetingDrawer({ id, onClose, onEdit }) {
  const { user } = useAuth();
  const { openProfile } = useProfile();
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ['meeting', id], queryFn: () => getMeeting(id), retry: false });
  const users = useQuery({ queryKey: ['users'], queryFn: getUsers, retry: false });
  const nameOf = Object.fromEntries((users.data || []).map((u) => [u.id, u.name]));
  const invalidate = () => qc.invalidateQueries({ queryKey: ['meeting', id] });
  const saveMinutes = useMutation({ mutationFn: (minutes) => updateMinutes(id, minutes), onSuccess: invalidate });
  const toggle = useMutation({ mutationFn: (actionId) => toggleMeetingAction(id, actionId), onSuccess: invalidate });
  const addAction = useMutation({ mutationFn: (text) => addMeetingAction(id, text), onSuccess: invalidate });
  const del = useMutation({
    mutationFn: () => deleteMeeting(id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['meetings'] }); qc.invalidateQueries({ queryKey: ['ms-calendar'] }); onClose(); },
  });
  const [newAction, setNewAction] = useState('');

  const m = q.data;
  const participant = m && (m.ownerId === user?.id || m.attendees.some((a) => a.id === user?.id));
  const canManage = m && (m.ownerId === user?.id || isAdmin(user));

  return (
    <div className="fixed inset-0 z-40 flex justify-end bg-black/30" onClick={onClose}>
      <div className="h-full w-full max-w-lg overflow-y-auto bg-paper p-6" onClick={(e) => e.stopPropagation()}>
        {!m ? <p className="text-ink-soft">Loading…</p> : (
          <>
            <div className="flex items-start justify-between">
              <div className="flex flex-wrap gap-2">
                <span className="rounded bg-steel-tint px-2 py-0.5 text-xs font-medium text-steel">{m.recurring}</span>
                {m.mode && <span className="rounded bg-pine-tint px-2 py-0.5 text-xs font-medium capitalize text-pine">{m.mode === 'offline' ? '🏢 Offline' : m.mode === 'online' ? '💻 Online' : '🔀 Hybrid'}</span>}
              </div>
              <div className="flex gap-2">
                {canManage && <button onClick={() => onEdit(m)} className="rounded-lg border border-line px-3 py-1 text-sm hover:border-pine">Edit</button>}
                {canManage && <button onClick={() => { if (confirm('Cancel this meeting? Any Teams invite is withdrawn.')) del.mutate(); }} disabled={del.isPending} className="rounded-lg border border-brick/40 px-3 py-1 text-sm text-brick hover:bg-brick/5 disabled:opacity-50">Cancel</button>}
                <button onClick={onClose} className="rounded-lg border border-line px-3 py-1 text-sm">Close</button>
              </div>
            </div>
            <h2 className="mt-3 font-serif text-2xl font-bold">{m.title}</h2>
            <div className="mt-1 flex flex-wrap gap-3 text-sm text-ink-soft">
              <span>{fmtDate(m.date)}</span><span>{m.time}</span>
              {m.durationMin && <span>{durLabel(m.durationMin)}</span>}
              {m.roomLabel && <span>📍 {m.roomLabel}</span>}
              <span>{m.owner.name} · chair</span>
              {m.recurring !== 'One-off' && m.recurEnd === 'until' && <span>until {m.recurUntil}</span>}
              {m.recurring !== 'One-off' && m.recurEnd === 'count' && <span>{m.recurCount}× occurrences</span>}
            </div>
            {m.event && (
              <a href="/events" className="mt-2 inline-flex items-center gap-1 rounded-lg bg-steel-tint px-2 py-1 text-xs font-medium text-steel hover:underline">
                🏷 {m.event.name}
              </a>
            )}
            {m.meetingLink && (
              <a href={m.meetingLink} target="_blank" rel="noreferrer"
                className="mt-3 flex w-fit items-center gap-2 rounded-lg bg-pine px-4 py-2 text-sm font-medium text-white hover:opacity-90">🔗 Join meeting</a>
            )}

            <section className="mt-5">
              <div className="text-xs font-semibold uppercase tracking-wide text-ink-soft">Attendees · {m.attendees.length}</div>
              <div className="mt-2 flex flex-wrap gap-2">
                {m.attendees.map((a) => (
                  <button key={a.id} onClick={() => openProfile(a.id)} className="flex items-center gap-1.5 rounded-full border border-line bg-white py-1 pl-1 pr-3 text-xs transition hover:border-pine">
                    <span className="flex h-6 w-6 items-center justify-center rounded-full bg-pine text-[10px] font-semibold text-white">{initials(a.name)}</span>{a.name}
                  </button>
                ))}
              </div>
            </section>

            {m.agenda.length > 0 && (
              <section className="mt-5">
                <div className="text-xs font-semibold uppercase tracking-wide text-ink-soft">Agenda</div>
                <ol className="mt-2 space-y-1.5">
                  {m.agenda.map((a, i) => <li key={i} className="flex gap-3 text-sm"><span className="font-mono text-xs text-ink-soft">{i + 1}</span>{a}</li>)}
                </ol>
              </section>
            )}

            {/* Minutes only open up once the meeting has started. */}
            {m.started ? (
              <section className="mt-5">
                <div className="text-xs font-semibold uppercase tracking-wide text-ink-soft">Minutes</div>
                {participant ? (
                  <>
                    <textarea defaultValue={m.minutes} rows={3} placeholder="Write up the meeting…"
                      onBlur={(e) => { if (e.target.value !== m.minutes) saveMinutes.mutate({ minutes: e.target.value }); }}
                      className="mt-2 w-full rounded-lg border border-line bg-white px-3 py-2 text-sm outline-none focus:border-pine" />
                    <MinutesFile m={m} onSave={(p) => saveMinutes.mutate(p)} />
                  </>
                ) : (
                  <>
                    <p className="mt-2 whitespace-pre-wrap text-sm text-ink-soft">{m.minutes || 'No minutes yet.'}</p>
                    {m.minutesFileUrl && (
                      <a href={m.minutesFileUrl} target="_blank" rel="noreferrer" className="mt-2 inline-block rounded-lg border border-line bg-white px-3 py-1.5 text-xs hover:border-pine">📄 {m.minutesFileName || 'Minutes PDF'}</a>
                    )}
                  </>
                )}
              </section>
            ) : (
              <section className="mt-5 rounded-xl border border-dashed border-line p-3 text-center">
                <p className="text-xs text-ink-soft">Minutes can be added once the meeting starts.</p>
              </section>
            )}

            <section className="mt-5">
              <div className="text-xs font-semibold uppercase tracking-wide text-ink-soft">Action items</div>
              <div className="mt-2 space-y-1.5">
                {m.actions.length === 0 && <p className="text-sm text-ink-soft">No action items.</p>}
                {m.actions.map((a) => (
                  <div key={a.id} className="flex items-center gap-2">
                    <button onClick={() => participant && toggle.mutate(a.id)} disabled={!participant}
                      className={`flex h-4 w-4 items-center justify-center rounded-full border ${a.done ? 'border-sage bg-sage text-white' : 'border-line'}`}>{a.done ? '✓' : ''}</button>
                    <span className={`flex-1 text-sm ${a.done ? 'text-ink-soft line-through' : ''}`}>{a.text}</span>
                    {a.ownerId && <span className="text-xs text-ink-soft">{nameOf[a.ownerId] || a.ownerId}</span>}
                  </div>
                ))}
              </div>
              {participant && (
                <div className="mt-2 flex gap-2">
                  <input value={newAction} onChange={(e) => setNewAction(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter' && newAction.trim()) { addAction.mutate(newAction.trim()); setNewAction(''); } }}
                    placeholder="Add an action item…" className="flex-1 rounded-lg border border-line px-3 py-2 text-sm" />
                </div>
              )}
            </section>
          </>
        )}
      </div>
    </div>
  );
}

// Optional minutes PDF, alongside the write-up.
function MinutesFile({ m, onSave }) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  async function onFile(e) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (file.size > 10 * 1024 * 1024) { setErr(`"${file.name}" is over 10MB`); return; }
    const dataUrl = await new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = rej; r.readAsDataURL(file); });
    setBusy(true);
    try { const up = await uploadFile(dataUrl, file.name); onSave({ fileUrl: up.url, fileName: file.name }); setErr(''); }
    catch (ex) { setErr(`Upload failed: ${ex.response?.data?.error?.message || ex.message}`); }
    finally { setBusy(false); }
  }

  return (
    <div className="mt-2">
      {m.minutesFileUrl ? (
        <div className="flex items-center gap-2">
          <a href={m.minutesFileUrl} target="_blank" rel="noreferrer" className="rounded-lg border border-line bg-white px-3 py-1.5 text-xs hover:border-pine">📄 {m.minutesFileName || 'Minutes PDF'}</a>
          <button onClick={() => onSave({ fileUrl: '', fileName: '' })} className="text-xs text-ink-soft hover:text-brick">Remove</button>
        </div>
      ) : (
        <label className={`inline-flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-1.5 text-xs ${busy ? 'opacity-60' : 'border-line hover:border-pine'}`}>
          📄 {busy ? 'Uploading…' : 'Attach minutes PDF'}
          <input type="file" accept=".pdf,application/pdf,.doc,.docx" onChange={onFile} className="hidden" disabled={busy} />
        </label>
      )}
      {err && <p className="mt-1 text-xs text-brick">{err}</p>}
    </div>
  );
}

// Type-to-search picker for tagging one institutional event to a meeting.
function EventTagPicker({ value, onChange }) {
  const [q, setQ] = useState('');
  const [open, setOpen] = useState(false);
  const events = useQuery({ queryKey: ['events', 'all', false], queryFn: () => getEvents('all', false), retry: false });
  const all = events.data || [];
  const selected = all.find((e) => e.id === value);

  const matches = q.trim()
    ? all.filter((e) => e.name.toLowerCase().includes(q.trim().toLowerCase())).slice(0, 8)
    : all.slice(0, 8);

  if (selected) {
    return (
      <div className="flex items-center justify-between rounded-lg border border-pine/40 bg-pine-tint/40 px-3 py-2">
        <span className="min-w-0 truncate text-sm text-pine">🏷 {selected.name}</span>
        <button type="button" onClick={() => { onChange(''); setQ(''); }} className="shrink-0 text-xs text-ink-soft hover:text-brick">Remove</button>
      </div>
    );
  }

  return (
    <div>
      <input
        value={q} onChange={(e) => { setQ(e.target.value); setOpen(true); }} onFocus={() => setOpen(true)}
        placeholder="Search projects by keyword…" className="inp" />
      {open && (
        <div className="mt-1 max-h-44 overflow-y-auto rounded-lg border border-line bg-white">
          {matches.length === 0 && <p className="px-3 py-2 text-xs text-ink-soft">No matching projects.</p>}
          {matches.map((e) => (
            <button key={e.id} type="button" onClick={() => { onChange(e.id); setOpen(false); }}
              className="block w-full px-3 py-1.5 text-left text-sm hover:bg-pine-tint">
              {e.name}
              <span className="ml-1 text-[11px] text-ink-soft">{triggerLabel(e)}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Create / edit modal ─────────────────────────────────────────────
function MeetingModal({ recurrences, rooms = [], meeting, initialDate, initialTime, onClose, onToast }) {
  const qc = useQueryClient();
  const editing = !!meeting;
  const [f, setF] = useState(() => meeting ? {
    title: meeting.title, date: meeting.date, time: meeting.time, durationMin: meeting.durationMin || 30,
    recurring: meeting.recurring, recurEnd: meeting.recurEnd || 'never', recurUntil: meeting.recurUntil || '', recurCount: meeting.recurCount || 5,
    mode: meeting.mode, meetingLink: meeting.msEventId ? '' : (meeting.meetingLink || ''), // hide auto Teams link so edit re-syncs it
    room: meeting.room || '', roomOther: meeting.roomOther || '', eventId: meeting.eventId || '',
    attendeeIds: meeting.attendees.map((a) => a.id), agenda: (meeting.agenda || []).join('\n'),
  } : {
    title: '', date: initialDate || '', time: initialTime || '10:00', durationMin: 30,
    recurring: 'One-off', recurEnd: 'never', recurUntil: '', recurCount: 5,
    mode: 'offline', meetingLink: '', room: '', roomOther: '', eventId: '',
    attendeeIds: [], agenda: '',
  });
  const [note, setNote] = useState('');
  const set = (k, v) => setF((s) => ({ ...s, [k]: v }));
  const ms = useQuery({ queryKey: ['ms-status'], queryFn: getMicrosoftStatus, retry: false });
  const willAutoTeams = f.mode !== 'offline' && !f.meetingLink.trim() && ms.data?.connected;

  const mut = useMutation({
    mutationFn: () => {
      const payload = { ...f, agenda: f.agenda.split('\n').map((a) => a.trim()).filter(Boolean) };
      return editing ? updateMeeting(meeting.id, payload) : createMeeting(payload);
    },
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ['meetings'] });
      qc.invalidateQueries({ queryKey: ['ms-calendar'] });
      if (editing) qc.invalidateQueries({ queryKey: ['meeting', meeting.id] });
      const summary = inviteSummary(data?.invited);
      if (data?.teamsWarning) {
        // Stay open — the warning needs attention; fold the invite tally in too.
        setNote([data.teamsWarning, summary].filter(Boolean).join(' · '));
      } else {
        if (summary) onToast?.(summary);
        onClose();
      }
    },
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4" onClick={onClose}>
      <div className="flex max-h-[90vh] w-full max-w-md flex-col overflow-hidden rounded-2xl bg-white" onClick={(e) => e.stopPropagation()}>
        <div className="shrink-0 border-b border-line px-6 pb-3 pt-6">
          <h3 className="font-serif text-lg font-semibold">{editing ? 'Edit meeting' : 'New meeting'}</h3>
        </div>
        <div className="flex-1 overflow-y-auto px-6 py-4">
          <label className="block text-sm"><span className="text-ink-soft">Title</span>
            <input value={f.title} onChange={(e) => set('title', e.target.value)} className="inp mt-1" /></label>
          <div className="mt-3 grid grid-cols-2 gap-3">
            <label className="block text-sm"><span className="text-ink-soft">Date</span>
              <input type="date" value={f.date} onChange={(e) => set('date', e.target.value)} className="inp mt-1" /></label>
            <label className="block text-sm"><span className="text-ink-soft">Time</span>
              <input type="time" value={f.time} onChange={(e) => set('time', e.target.value)} className="inp mt-1" /></label>
            <label className="block text-sm"><span className="text-ink-soft">Duration</span>
              <select value={f.durationMin} onChange={(e) => set('durationMin', +e.target.value)} className="inp mt-1">
                {[15, 30, 45, 60, 90, 120, 180, 240].map((d) => <option key={d} value={d}>{durLabel(d)}</option>)}
              </select></label>
            <label className="block text-sm"><span className="text-ink-soft">Recurs</span>
              <select value={f.recurring} onChange={(e) => set('recurring', e.target.value)} className="inp mt-1">{recurrences.map((r) => <option key={r}>{r}</option>)}</select></label>
          </div>

          {f.recurring !== 'One-off' && (
            <div className="mt-3 rounded-lg border border-line/70 bg-paper/30 p-2.5 text-sm">
              <span className="text-ink-soft">Ends</span>
              <div className="mt-1.5 space-y-1.5">
                <label className="flex items-center gap-2"><input type="radio" checked={f.recurEnd === 'never'} onChange={() => set('recurEnd', 'never')} /> Never</label>
                <label className="flex items-center gap-2"><input type="radio" checked={f.recurEnd === 'until'} onChange={() => set('recurEnd', 'until')} /> On date
                  <input type="date" value={f.recurUntil} min={f.date} onChange={(e) => { set('recurUntil', e.target.value); set('recurEnd', 'until'); }} className="ml-1 rounded border border-line px-2 py-1 text-xs" /></label>
                <label className="flex items-center gap-2"><input type="radio" checked={f.recurEnd === 'count'} onChange={() => set('recurEnd', 'count')} /> After
                  <input type="number" min={1} max={365} value={f.recurCount} onChange={(e) => { set('recurCount', Math.max(1, +e.target.value || 1)); set('recurEnd', 'count'); }} className="ml-1 w-16 rounded border border-line px-2 py-1 text-xs" /> times</label>
              </div>
            </div>
          )}

          <div className="mt-3 text-sm">
            <span className="text-ink-soft">Mode</span>
            <div className="mt-1 flex gap-2">
              {['offline', 'online', 'hybrid'].map((mo) => (
                <button key={mo} type="button" onClick={() => set('mode', mo)}
                  className={`flex-1 rounded-lg border px-3 py-2 text-sm capitalize ${f.mode === mo ? 'border-pine bg-pine text-white' : 'border-line text-ink-soft hover:border-pine'}`}>{mo}</button>
              ))}
            </div>
          </div>
          {f.mode !== 'offline' && (
            <label className="mt-3 block text-sm"><span className="text-ink-soft">Meeting link</span>
              <input value={f.meetingLink} onChange={(e) => set('meetingLink', e.target.value)} className="inp mt-1"
                placeholder={ms.data?.connected ? 'Leave blank to auto-create a Teams meeting' : 'Paste the Zoom / Teams / Meet link'} />
              {willAutoTeams
                ? <p className="mt-1 text-[11px] text-sage">✓ A Teams meeting will be created on your Outlook and attendees invited.</p>
                : !ms.data?.connected
                  ? <p className="mt-1 text-[11px] text-ink-soft">Connect Microsoft in <a href="/profile" className="text-pine hover:underline">Profile</a> to auto-create a Teams link.</p>
                  : null}
            </label>
          )}
          {f.mode !== 'online' && (
            <div className="mt-3 text-sm">
              <span className="text-ink-soft">Meeting room</span>
              <div className="mt-1 grid gap-1.5">
                {rooms.map((r) => (
                  <button key={r.id} type="button" onClick={() => set('room', f.room === r.id ? '' : r.id)}
                    className={`rounded-lg border px-3 py-2 text-left ${f.room === r.id ? 'border-pine bg-pine-tint/50' : 'border-line hover:border-pine'}`}>
                    <div className="text-sm font-medium text-ink">{r.id}</div>
                    <div className="text-[11px] text-ink-soft">{r.hint}</div>
                  </button>
                ))}
              </div>
              {f.room === 'Others' && (
                <input value={f.roomOther} onChange={(e) => set('roomOther', e.target.value)} placeholder="Which room?"
                  className="inp mt-1.5" />
              )}
            </div>
          )}

          <div className="mt-3 text-sm">
            <span className="text-ink-soft">Tag a project <span className="text-xs">(optional)</span></span>
            <div className="mt-1"><EventTagPicker value={f.eventId} onChange={(id) => set('eventId', id)} /></div>
          </div>

          <div className="mt-3 text-sm"><span className="text-ink-soft">Attendees</span>
            <div className="mt-1"><AssignPicker value={f.attendeeIds} onChange={(arr) => set('attendeeIds', arr)} /></div>
          </div>
          <label className="mt-3 block text-sm"><span className="text-ink-soft">Agenda <span className="text-xs">(one per line)</span></span>
            <textarea rows={3} value={f.agenda} onChange={(e) => set('agenda', e.target.value)} className="inp mt-1" /></label>
          {mut.error && <p className="mt-3 text-sm text-brick">{mut.error.response?.data?.error?.message || 'Failed'}</p>}
          {note && <p className="mt-3 rounded-lg bg-ochre-tint/40 px-3 py-2 text-sm text-ochre">Saved. {note}</p>}
        </div>

        <div className="flex shrink-0 items-center justify-end gap-2 border-t border-line bg-white px-6 py-3">
          <button onClick={onClose} className="rounded-lg border border-line px-4 py-2 text-sm">{note ? 'Close' : 'Cancel'}</button>
          {!note && <button onClick={() => mut.mutate()} disabled={!f.title.trim() || !f.date || mut.isPending} className="rounded-lg bg-pine px-4 py-2 text-sm font-medium text-white disabled:opacity-60">{mut.isPending ? 'Saving…' : editing ? 'Save changes' : 'Schedule'}</button>}
        </div>
      </div>
    </div>
  );
}
