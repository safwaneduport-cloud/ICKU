import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { getNotifications } from '../../api/notifications.api.js';

const KIND = {
  overdue: { dot: '#9C3A2A', label: 'Overdue' },
  approval: { dot: '#3F6075', label: 'Approval' },
  leave: { dot: '#9A6312', label: 'Leave' },
  expense: { dot: '#9A6312', label: 'Expense' },
  announcement: { dot: '#134535', label: 'News' },
  kudos: { dot: '#2C7A57', label: 'Kudos' },
  message: { dot: '#2C7A57', label: 'Message' },
};

export default function NotificationBell() {
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();
  const q = useQuery({
    queryKey: ['notifications'],
    queryFn: getNotifications,
    retry: false,
    refetchInterval: 60_000, // keep the badge reasonably fresh
    refetchOnWindowFocus: true,
  });

  const count = q.data?.count ?? 0;
  const items = q.data?.items ?? [];

  const go = (link) => {
    setOpen(false);
    if (link) navigate(link);
  };

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        className="relative flex h-9 w-9 items-center justify-center rounded-lg border border-line text-ink-soft transition hover:border-pine hover:text-pine"
        aria-label="Notifications"
      >
        {/* bell glyph */}
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
          <path d="M13.7 21a2 2 0 0 1-3.4 0" />
        </svg>
        {count > 0 && (
          <span className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-brick px-1 text-[10px] font-semibold text-white">
            {count > 9 ? '9+' : count}
          </span>
        )}
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute right-0 z-50 mt-2 w-80 overflow-hidden rounded-2xl border border-line bg-white shadow-2xl">
            <div className="flex items-center justify-between border-b border-line px-4 py-3">
              <span className="font-serif text-sm font-bold text-pine">Notifications</span>
              <span className="font-mono text-[11px] text-ink-soft">
                {count > 0 ? `${count} need${count === 1 ? 's' : ''} action` : 'All clear'}
              </span>
            </div>
            <div className="max-h-96 overflow-y-auto">
              {q.isLoading && <p className="px-4 py-6 text-center text-sm text-ink-soft">Loading…</p>}
              {q.isError && <p className="px-4 py-6 text-center text-sm text-brick">Couldn’t load notifications.</p>}
              {!q.isLoading && !q.isError && items.length === 0 && (
                <p className="px-4 py-8 text-center text-sm text-ink-soft">You’re all caught up.</p>
              )}
              {items.map((it) => {
                const k = KIND[it.kind] || KIND.announcement;
                return (
                  <button
                    key={it.id}
                    onClick={() => go(it.link)}
                    className="flex w-full items-start gap-3 border-b border-line/60 px-4 py-3 text-left last:border-0 hover:bg-pine-tint"
                  >
                    <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full" style={{ background: k.dot }} />
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-2">
                        <span className="truncate text-sm font-medium text-ink">{it.title}</span>
                        {it.actionable && (
                          <span
                            className="shrink-0 rounded px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-white"
                            style={{ background: k.dot }}
                          >
                            {k.label}
                          </span>
                        )}
                      </span>
                      {it.sub && <span className="mt-0.5 block truncate text-xs text-ink-soft">{it.sub}</span>}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
