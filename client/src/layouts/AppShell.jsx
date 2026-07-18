import { useEffect, useState } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '../store/AuthContext.jsx';
import { ProfileProvider, useProfile } from '../store/ProfileContext.jsx';
import NotificationBell from '../features/notifications/NotificationBell.jsx';

// Sidebar navigation, grouped into labeled sections. A group with no `title`
// renders its items without a header (used for the standalone Overview link).
// `stars` marks the areas we want people focused on during the pilot launch
// (★★ = primary focus, ★ = secondary). Purely a visual cue.
const NAV_GROUPS = [
  { items: [{ to: '/', label: 'My Day', end: true, stars: 2 }, { to: '/messages', label: 'Messages', stars: 1 }] },
  {
    title: 'Work',
    items: [
      { to: '/events', label: 'Projects and Tasks', stars: 2 },
      { to: '/calendar', label: 'Institutional Calendar', stars: 2 },
      { to: '/okrs', label: 'OKRs & Checklists', stars: 2 },
      { to: '/meetings', label: 'Meetings', stars: 1 },
      { to: '/approvals', label: 'Approvals', stars: 1 },
      { to: '/workspaces', label: 'Workspaces', stars: 1 },
    ],
  },
  {
    title: 'HR',
    items: [
      { to: '/profile', label: 'Profile' },
      { to: '/attendance', label: 'Attendance' },
      { to: '/leave', label: 'Leave' },
      { to: '/payroll', label: 'Payroll' },
      { to: '/onboarding', label: 'Onboarding' },
      { to: '/exit', label: 'Exit' },
    ],
  },
  {
    title: 'Services',
    items: [
      { to: '/expenses', label: 'Expenses', stars: 1 },
      { to: '/assethub', label: 'AssetHub', stars: 1 },
      { to: '/assets', label: 'IT Devices', stars: 1 },
      { to: '/helpdesk', label: 'Helpdesk', stars: 1 },
    ],
  },
  {
    title: 'Company',
    items: [
      { to: '/org', label: 'Organization', stars: 1 },
      { to: '/knowledge', label: 'Knowledge Base', stars: 1 },
      { to: '/announcements', label: 'Announcements' },
      { to: '/engagement', label: 'Engagement' },
    ],
  },
];

function initials(name = '') {
  return name.split(' ').map((w) => w[0]).slice(0, 2).join('').toUpperCase();
}

function Shell() {
  const { user, logout } = useAuth();
  const { openProfile } = useProfile();
  const location = useLocation();
  // Off-canvas nav on phones; a static sidebar from lg up.
  const [navOpen, setNavOpen] = useState(false);
  useEffect(() => { setNavOpen(false); }, [location.pathname]); // close after navigating
  const isAdmin = user?.id === 'ceo' || user?.role === 'HR Head';
  const isReports = isAdmin || user?.tier === 'Leadership';
  const adminItems = [
    ...(isReports ? [{ to: '/reports', label: 'Reports' }] : []),
    ...(isAdmin ? [{ to: '/admin', label: 'Admin Console' }] : []),
  ];
  const groups = [
    ...NAV_GROUPS.map((g) =>
      g.title === 'HR' && isAdmin
        ? { ...g, items: [...g.items, { to: '/master-data', label: 'Master Data' }, { to: '/credentials', label: 'Credentials' }] }
        : g
    ),
    ...(adminItems.length ? [{ title: 'Admin', items: adminItems }] : []),
  ];

  return (
    <div className="flex min-h-screen">
      {/* Backdrop behind the mobile nav */}
      {navOpen && <div className="fixed inset-0 z-30 bg-ink/40 lg:hidden" onClick={() => setNavOpen(false)} aria-hidden="true" />}

      {/* Sidebar — a slide-in drawer on phones, static from lg up */}
      <aside className={`fixed inset-y-0 left-0 z-40 flex w-64 max-w-[85vw] flex-col border-r border-line bg-white transition-transform duration-200 lg:static lg:z-auto lg:max-h-screen lg:w-60 lg:translate-x-0 ${navOpen ? 'translate-x-0' : '-translate-x-full'}`}>
        <div className="flex items-start justify-between px-5 py-5">
          <div>
            <div className="text-[10px] font-mono uppercase tracking-widest text-ochre">
              Company OS
            </div>
            <div className="font-serif text-2xl font-bold text-pine">ICKU</div>
          </div>
          <button onClick={() => setNavOpen(false)} className="-mr-1 rounded-lg p-1 text-ink-soft hover:bg-paper lg:hidden" aria-label="Close menu">✕</button>
        </div>
        <nav className="flex flex-1 flex-col overflow-y-auto px-3 pb-4">
          {groups.map((group, gi) => (
            <div key={group.title || 'top'} className={group.title ? 'mt-5' : ''}>
              {group.title && (
                <div className="px-3 pb-1 text-[10px] font-mono font-semibold uppercase tracking-widest text-ink-soft/60">
                  {group.title}
                </div>
              )}
              <div className="flex flex-col gap-0.5">
                {group.items.map((n) => (
                  <NavLink
                    key={n.to}
                    to={n.to}
                    end={n.end}
                    className={({ isActive }) =>
                      `rounded-lg px-3 py-2 text-sm font-medium transition ${
                        isActive ? 'bg-pine text-white' : 'text-ink-soft hover:bg-pine-tint hover:text-pine'
                      }`
                    }
                  >
                    {n.label}
                    {n.stars > 0 && (
                      <span className="ml-1 align-super text-[9px] leading-none text-[#E9C46A]" aria-hidden="true">
                        {'★'.repeat(n.stars)}
                      </span>
                    )}
                  </NavLink>
                ))}
              </div>
            </div>
          ))}
        </nav>
        <div className="border-t border-line p-3">
          <button
            onClick={() => user?.id && openProfile(user.id)}
            className="flex w-full items-center gap-3 rounded-lg p-1 text-left transition hover:bg-pine-tint"
            title="View my profile"
          >
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-pine text-xs font-semibold text-white">
              {initials(user?.name)}
            </div>
            <div className="min-w-0">
              <div className="truncate text-sm font-medium">{user?.name}</div>
              <div className="truncate text-xs text-ink-soft">{user?.tier}</div>
            </div>
          </button>
          <button
            onClick={logout}
            className="mt-3 w-full rounded-lg border border-line py-1.5 text-xs text-ink-soft hover:border-brick hover:text-brick"
          >
            Sign out
          </button>
        </div>
      </aside>

      {/* Main — min-w-0 so wide children (tables, calendars) can scroll instead
          of stretching the page sideways on a phone. */}
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-20 flex items-center gap-3 border-b border-line bg-paper/90 px-4 py-3 backdrop-blur sm:px-8 sm:py-4">
          <button onClick={() => setNavOpen(true)} className="-ml-1 rounded-lg p-1.5 text-pine hover:bg-pine-tint lg:hidden" aria-label="Open menu">
            <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round">
              <path d="M3 5h14M3 10h14M3 15h14" />
            </svg>
          </button>
          <div className="min-w-0 truncate text-[11px] font-mono uppercase tracking-widest text-ochre">
            <span className="hidden sm:inline">Signed in as </span>{user?.name}<span className="hidden sm:inline"> · {user?.role}</span>
          </div>
          <div className="ml-auto shrink-0"><NotificationBell /></div>
        </header>
        <main className="min-w-0 px-4 py-5 sm:px-8 sm:py-8">
          <Outlet />
        </main>
      </div>
    </div>
  );
}

export default function AppShell() {
  return (
    <ProfileProvider>
      <Shell />
    </ProfileProvider>
  );
}
