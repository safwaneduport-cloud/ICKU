// Salary helpers — shared by the seed (base comp) and the service (payslip breakup).

const TIER_BASE = { Leadership: 300000, 'Department Head': 130000, Manager: 72000, Employee: 38000 };

// Deterministic monthly gross by tier (used to seed the Salary table).
export function monthlyGrossFor(tier, userId) {
  const base = TIER_BASE[tier] ?? 42000;
  return base + ((userId.charCodeAt(0) || 65) % 8) * 1500;
}

// Compute a payslip breakup from monthly gross + this month's absent days (LOP).
export function computeBreakup(monthlyGross, tier, absentDays) {
  const g0 = monthlyGross;
  const basic = Math.round(g0 * 0.5);
  const hra = Math.round(basic * 0.4);
  const conveyance = 1600;
  const special = g0 - basic - hra - conveyance;
  const variable = tier === 'Manager' || tier === 'Department Head' ? Math.round(g0 * 0.08) : 0;

  const earnings = [
    { label: 'Basic Pay', amt: basic },
    { label: 'HRA', amt: hra },
    { label: 'Conveyance', amt: conveyance },
    { label: 'Special Allowance', amt: special },
  ];
  if (variable) earnings.push({ label: 'Incentive / Variable', amt: variable });
  const gross = earnings.reduce((a, e) => a + e.amt, 0);

  const pf = Math.round(basic * 0.12);
  const pt = 200;
  const esi = gross < 21000 ? Math.round(gross * 0.0075) : 0;
  const tds = Math.round((Math.max(0, gross * 12 - 500000) * 0.05) / 12);
  const lop = absentDays > 0 ? Math.round((gross / 26) * absentDays) : 0;

  const deductions = [
    { label: 'Provident Fund (PF)', amt: pf },
    { label: 'Professional Tax', amt: pt },
  ];
  if (esi) deductions.push({ label: 'ESI', amt: esi });
  if (tds) deductions.push({ label: 'Income Tax (TDS)', amt: tds });
  if (lop) deductions.push({ label: `LOP · ${absentDays}d`, amt: lop });

  const dedTotal = deductions.reduce((a, d) => a + d.amt, 0);
  return {
    gross, earnings, deductions, dedTotal, net: gross - dedTotal,
    absentDays, ctc: g0 * 12,
    statutory: { pf, pt, esi, tds },
  };
}
