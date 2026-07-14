export const STATUS = {
  draft: { label: 'Draft', c: '#5E635B', b: '#F1EFE8' },
  pending_branch: { label: 'Pending Branch Approval', c: '#9A6312', b: '#F5EAD4' },
  pending_finance_review: { label: 'Pending Finance Review', c: '#9A6312', b: '#F5EAD4' },
  pending_finance_approval: { label: 'Pending Finance Approval', c: '#9A6312', b: '#F5EAD4' },
  pending_ack: { label: 'Pending Acknowledgement', c: '#3F6075', b: '#E3EAEF' },
  active: { label: 'Active', c: '#2C7A57', b: '#E2EFE7' },
  under_repair: { label: 'Under Repair', c: '#9A6312', b: '#F5EAD4' },
  in_transfer: { label: 'In Transfer', c: '#3F6075', b: '#E3EAEF' },
  disposed: { label: 'Disposed', c: '#5E635B', b: '#F1EFE8' },
  written_off: { label: 'Written Off', c: '#9C3A2A', b: '#F3E1DC' },
  void: { label: 'Void', c: '#9C3A2A', b: '#F3E1DC' },
};

export const ROLE_LABEL = {
  OPERATIONS: 'Operations Staff', BRANCH_MANAGER: 'Branch Manager / Warden',
  FINANCE_EXECUTIVE: 'Finance Executive', FINANCE_MANAGER: 'Finance Manager',
  CFO: 'CFO', ASSET_ADMIN: 'System Admin',
};

export const inr = (n) => (n == null ? '—' : `₹${Number(n).toLocaleString('en-IN')}`);

export const ACTION_LABEL = {
  created: 'Created', submitted: 'Submitted for approval', approved: 'Approved',
  sent_back: 'Sent back', finance_edited: 'Finance edit', acknowledged: 'Acknowledged',
  voided: 'Voided', room_assigned: 'Room assigned',
};
