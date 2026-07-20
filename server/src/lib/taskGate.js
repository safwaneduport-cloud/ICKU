// The one place that decides whether a task assignment goes live immediately or
// waits for approval. The gate is keyed on the RECIPIENT, not the assigner: a
// task assigned *to* someone is controlled by that person's autoApproveTasks flag
// (set by their manager), and approved by that person's reporting manager.
//
// `recipient` is a prefetched row { autoApproveTasks, reportsToId } so callers can
// look up many recipients in one query. Returns the per-assignee approval state.
//
// Auto-approves (no manager gate) when any of:
//   • the recipient auto-approves tasks (flag on, the default), or
//   • the recipient has no reporting manager (nobody to gate them), or
//   • the person assigning IS the recipient's manager (no point self-approving).
export function gateFor(assignerId, recipient) {
  const managerId = recipient?.reportsToId || null;
  const auto = recipient?.autoApproveTasks !== false || !managerId || managerId === assignerId;
  return auto ? { approval: 'approved', approverId: null } : { approval: 'pending', approverId: managerId };
}
