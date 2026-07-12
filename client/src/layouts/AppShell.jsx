import { NavLink, Outlet } from 'react-router-dom';
import { useAuth } from '../store/AuthContext.jsx';
import { ProfileProvider, useProfile } from '../store/ProfileContext.jsx';
import NotificationBell from '../features/notifications/NotificationBell.jsx';

// Sidebar navigation, grouped into labeled sections. A group with no `title`
// renders its items without a header (used for the standalone Overview link).
const NAV_GROUPS = [
  { items: [{ to: '/', label: 'Overview', end: true }, { to: '/messages', label: 'Messages' }] },
  {
    title: 'Work',
    items: [
      { to: '/events', label: 'Tasks & Events' },
      { to: '/okrs', label: 'OKRs & Checklists' },
      { to: '/meetings', label: 'Meetings' },
      { to: '/approvals', label: 'Approvals' },
      { to: '/workspaces', label: 'Workspaces' },
    ],
  },
  {
    title: 'HR',
    items: [
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
      { to: '/expenses', label: 'Expenses' },
      { to: '/assets', label: 'Assets' },
      { to: '/helpdesk', label: 'Helpdesk' },
    ],
  },
  {
    title: 'Company',
    items: [
      { to: '/org', label: 'Organization' },
      { to: '/knowledge', label: 'Knowledge Base' },
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
      {/* Sidebar */}
      <aside className="flex max-h-screen w-60 flex-col border-r border-line bg-white">
        <div className="px-5 py-5">
          <div className="text-[10px] font-mono uppercase tracking-widest text-ochre">
            Company OS
          </div>
          <div className="font-serif text-2xl font-bold text-pine">ICKU</div>
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

      {/* Main */}
      <div className="flex-1">
        <header className="flex items-center justify-between border-b border-line bg-white/60 px-8 py-4">
          <div className="text-[11px] font-mono uppercase tracking-widest text-ochre">
            Signed in as {user?.name} · {user?.role}
          </div>
          <NotificationBell />
        </header>
        <main className="px-8 py-8">
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
