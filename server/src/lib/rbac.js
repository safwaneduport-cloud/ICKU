// Capability matrix — mirrors the prototype's TIER_CAPS.
// Layer (a) of authorization: what a tier is allowed to do at all.
// NB: live authorization uses role-based helpers in lib/access.js; this matrix is
// the editable reference shown/managed in the Admin Console (persisted as TierCapability rows).
export const TIER_CAPS = {
  Leadership: ['view', 'assign', 'approve', 'admin', 'manage_org'],
  'Department Head': ['view', 'assign', 'approve'],
  Manager: ['view', 'assign'],
  Employee: ['view'],
};

export const TIERS = ['Leadership', 'Department Head', 'Manager', 'Employee'];
export const CAPABILITIES = [
  { id: 'view', label: 'View' },
  { id: 'assign', label: 'Assign' },
  { id: 'approve', label: 'Approve' },
  { id: 'admin', label: 'Admin' },
  { id: 'manage_org', label: 'Manage org' },
];

export function hasCapability(tier, cap) {
  return (TIER_CAPS[tier] || []).includes(cap);
}
