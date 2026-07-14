// Group a users list into [deptName, members][], sorted by department then name.
// `term` filters across name / role / department (same behaviour everywhere).
export function groupByDept(users = [], term = '') {
  const t = term.trim().toLowerCase();
  const filtered = t
    ? users.filter((u) =>
        u.name.toLowerCase().includes(t) ||
        (u.role || '').toLowerCase().includes(t) ||
        (u.department?.name || '').toLowerCase().includes(t))
    : users;
  const map = new Map();
  for (const u of filtered) {
    const dept = u.department?.name || 'Unassigned';
    if (!map.has(dept)) map.set(dept, []);
    map.get(dept).push(u);
  }
  return [...map.entries()]
    .map(([dept, list]) => [dept, list.sort((a, b) => a.name.localeCompare(b.name))])
    .sort((a, b) => a[0].localeCompare(b[0]));
}
