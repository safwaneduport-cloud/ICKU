// Role-based access helpers operating on req.user = { id, role, tier }.
// Mirrors the prototype's canAdmin / canPayroll.
export const canAdmin = (user) => user?.id === 'ceo' || user?.id === 'EP002' || user?.role === 'HR Head';
export const canPayroll = (user) => canAdmin(user) || user?.role === 'Finance Head';
// Asset admins: admins + Tech Head. Helpdesk agents: admins + Tech/HR Head.
export const canAssets = (user) => canAdmin(user) || user?.role === 'Tech Head';
export const canHelpdesk = (user) => canAdmin(user) || ['Tech Head', 'HR Head'].includes(user?.role);
// Company-wide analytics: leadership + admins.
export const canReports = (user) => canAdmin(user) || user?.tier === 'Leadership';
