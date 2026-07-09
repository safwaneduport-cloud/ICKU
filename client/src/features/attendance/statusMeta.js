// Status → label + brand colors (carried from the prototype's ATT_META).
export const STATUS_META = {
  present:  { label: 'Present',    color: '#2C7A57', tint: '#E2EFE7' },
  late:     { label: 'Late',       color: '#9A6312', tint: '#F5EAD4' },
  half:     { label: 'Half-day',   color: '#3F6075', tint: '#E3EAEF' },
  absent:   { label: 'Absent',     color: '#9C3A2A', tint: '#F3E1DC' },
  off:      { label: 'Weekly off', color: '#5E635B', tint: '#F1EFE8' },
  holiday:  { label: 'Holiday',    color: '#134535', tint: '#E4EDE7' },
  leave:    { label: 'On leave',   color: '#9A6312', tint: '#F5EAD4' },
  pending:  { label: 'Not marked', color: '#5E635B', tint: '#F1EFE8' },
  upcoming: { label: '—',          color: '#DEDBD1', tint: 'transparent' },
};

export const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

// Last `n` months (newest first) as { y, m } — for the month switcher.
export function recentMonths(n = 6) {
  const out = [];
  const d = new Date();
  let y = d.getFullYear();
  let m = d.getMonth() + 1;
  for (let i = 0; i < n; i++) {
    out.push({ y, m });
    m -= 1;
    if (m < 1) { m = 12; y -= 1; }
  }
  return out;
}
