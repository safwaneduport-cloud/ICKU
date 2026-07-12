import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { getProfile } from '../../api/users.api.js';
import { useAuth } from '../../store/AuthContext.jsx';

function initials(name = '') {
  return name.split(' ').map((w) => w[0]).slice(0, 2).join('').toUpperCase();
}

function prettyDate(s) {
  if (!s) return null;
  // Stored as "MM-DD" (birthday) or "YYYY-MM-DD" (joinedOn).
  const parts = s.split('-').map(Number);
  const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  if (parts.length === 2) return `${MON[parts[0] - 1]} ${parts[1]}`;
  if (parts.length === 3) return `${MON[parts[1] - 1]} ${parts[2]}, ${parts[0]}`;
  return s;
}

function Stat({ label, value }) {
  return (
    <div className="rounded-xl border border-line bg-paper/50 px-3 py-2">
      <div className="font-serif text-xl font-bold text-pine">{value}</div>
      <div className="text-[11px] uppercase tracking-wide text-ink-soft">{label}</div>
    </div>
  );
}

function PersonRow({ person, onClick }) {
  return (
    <button
      onClick={() => onClick(person.id)}
      className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left hover:bg-pine-tint"
    >
      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-steel/15 text-[10px] font-semibold text-steel">
        {initials(person.name)}
      </span>
      <span className="min-w-0">
        <span className="block truncate text-sm font-medium text-ink">{person.name}</span>
        {person.designation && (
          <span className="block truncate text-xs text-ink-soft">{person.designation}</span>
        )}
      </span>
    </button>
  );
}

export default function ProfileDrawer({ userId, onClose, onNavigate }) {
  const open = !!userId;
  const { user } = useAuth();
  const navigate = useNavigate();
  const isHr = user?.id === 'ceo' || user?.id === 'EP002' || user?.role === 'HR Head';
  const q = useQuery({
    queryKey: ['profile', userId],
    queryFn: () => getProfile(userId),
    enabled: open,
    retry: false,
  });
  const p = q.data;
  const att = p?.attendance;

  const editProfile = () => { navigate(`/profile?id=${userId}`); onClose(); };

  return (
    <>
      {/* Overlay */}
      <div
        onClick={onClose}
        className={`fixed inset-0 z-40 bg-ink/30 transition-opacity ${
          open ? 'opacity-100' : 'pointer-events-none opacity-0'
        }`}
      />
      {/* Panel */}
      <aside
        className={`fixed right-0 top-0 z-50 flex h-full w-full max-w-md flex-col border-l border-line bg-white shadow-2xl transition-transform duration-200 ${
          open ? 'translate-x-0' : 'translate-x-full'
        }`}
      >
        {open && (
          <>
            <div className="flex items-center justify-between border-b border-line px-5 py-4">
              <div className="text-[11px] font-mono uppercase tracking-widest text-ochre">Profile</div>
              <div className="flex items-center gap-3">
                {isHr && userId && (
                  <button onClick={editProfile} className="rounded-lg border border-line px-2.5 py-1 text-xs font-medium text-pine hover:border-pine">
                    Edit profile →
                  </button>
                )}
                <button onClick={onClose} className="text-ink-soft hover:text-brick" aria-label="Close">✕</button>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto px-5 py-5">
              {q.isLoading && <p className="text-sm text-ink-soft">Loading…</p>}
              {q.isError && <p className="text-sm text-brick">Couldn’t load this profile.</p>}

              {p && (
                <div className="space-y-5">
                  {/* Identity */}
                  <div className="flex items-center gap-3">
                    <div className="flex h-14 w-14 items-center justify-center rounded-xl bg-pine text-lg font-semibold text-white">
                      {initials(p.name)}
                    </div>
                    <div className="min-w-0">
                      <div className="truncate font-serif text-xl font-bold text-pine">{p.name}</div>
                      <div className="truncate text-sm text-ink-soft">{p.designation || p.role}</div>
                      <div className="mt-1 flex flex-wrap items-center gap-1.5">
                        <span className="rounded bg-paper px-2 py-0.5 font-mono text-[11px]">{p.tier}</span>
                        {p.department?.name && (
                          <span
                            className="rounded px-2 py-0.5 text-[11px] font-medium"
                            style={{ background: (p.department.color || '#134535') + '22', color: p.department.color || '#134535' }}
                          >
                            {p.department.name}
                          </span>
                        )}
                        {p.status && p.status !== 'active' && (
                          <span className="rounded bg-brick/10 px-2 py-0.5 text-[11px] font-medium text-brick capitalize">{p.status}</span>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Meta */}
                  <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
                    {p.email && (
                      <div className="col-span-2">
                        <dt className="text-[11px] uppercase tracking-wide text-ink-soft">Email</dt>
                        <dd className="truncate text-ink">{p.email}</dd>
                      </div>
                    )}
                    <div>
                      <dt className="text-[11px] uppercase tracking-wide text-ink-soft">Role</dt>
                      <dd className="text-ink">{p.role}</dd>
                    </div>
                    {prettyDate(p.joinedOn) && (
                      <div>
                        <dt className="text-[11px] uppercase tracking-wide text-ink-soft">Joined</dt>
                        <dd className="text-ink">{prettyDate(p.joinedOn)}</dd>
                      </div>
                    )}
                    {prettyDate(p.birthday) && (
                      <div>
                        <dt className="text-[11px] uppercase tracking-wide text-ink-soft">Birthday</dt>
                        <dd className="text-ink">{prettyDate(p.birthday)}</dd>
                      </div>
                    )}
                  </dl>

                  {/* Reports to */}
                  {p.reportsTo && (
                    <div>
                      <div className="mb-1 text-[11px] uppercase tracking-wide text-ink-soft">Reports to</div>
                      <PersonRow person={p.reportsTo} onClick={onNavigate} />
                    </div>
                  )}

                  {/* This-month snapshot */}
                  {att && (
                    <div>
                      <div className="mb-2 text-[11px] uppercase tracking-wide text-ink-soft">This month</div>
                      <div className="grid grid-cols-3 gap-2">
                        <Stat label="Days worked" value={att.daysWorked ?? 0} />
                        <Stat label="On-time %" value={`${att.onTimePct ?? 0}%`} />
                        <Stat label="Avg hrs" value={att.avgHours ?? 0} />
                        <Stat label="Assets" value={p.assetCount} />
                        <Stat label="Kudos" value={p.kudosReceived} />
                        <Stat label="Reports" value={p.directReports.length} />
                      </div>
                    </div>
                  )}

                  {/* Responsibilities */}
                  {p.duties?.length > 0 && (
                    <div>
                      <div className="mb-1.5 text-[11px] uppercase tracking-wide text-ink-soft">Responsibilities</div>
                      <ul className="space-y-1">
                        {p.duties.map((d) => (
                          <li key={d.id} className="flex gap-2 text-sm text-ink">
                            <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-sage" />
                            <span>{d.text}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {/* Direct reports */}
                  {p.directReports.length > 0 && (
                    <div>
                      <div className="mb-1 text-[11px] uppercase tracking-wide text-ink-soft">
                        Direct reports · {p.directReports.length}
                      </div>
                      <div className="space-y-0.5">
                        {p.directReports.map((r) => (
                          <PersonRow key={r.id} person={r} onClick={onNavigate} />
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          </>
        )}
      </aside>
    </>
  );
}
