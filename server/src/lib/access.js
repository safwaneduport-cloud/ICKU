// Role-based access helpers operating on req.user = { id, role, tier }.
// Mirrors the prototype's canAdmin / canPayroll.
export const canAdmin = (user) => user?.id === 'ceo' || user?.id === 'EP002' || user?.role === 'HR Head';
export const canPayroll = (user) => canAdmin(user) || user?.role === 'Finance Head';
// Asset admins: admins + Tech Head. Helpdesk agents: admins + Tech/HR Head.
export const canAssets = (user) => canAdmin(user) || user?.role === 'Tech Head';
export const canHelpdesk = (user) => canAdmin(user) || ['Tech Head', 'HR Head'].includes(user?.role);
// Company-wide analytics: leadership + admins.
export const canReports = (user) => canAdmin(user) || user?.tier === 'Leadership';

// AssetHub is deliberately NOT gated on canAdmin: master data (locations, vendors,
// approval bands) is controlled by an explicit ASSET_ADMIN assignment list managed
// in Setup → Roles, so a change of job title can never silently hand someone the
// asset register. The CEO is the one permanent fallback, so the hub can't be
// locked out if the last ASSET_ADMIN is removed.
export const isCeo = (user) => user?.id === 'ceo' || user?.id === 'EP002';
