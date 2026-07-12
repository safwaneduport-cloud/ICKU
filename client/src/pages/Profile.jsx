import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '../store/AuthContext.jsx';
import { getMyProfile, getEmployeeProfile, updateEmployeeProfile } from '../api/employees.api.js';
import { getActiveOptions } from '../api/masters.api.js';
import { changeOwnPassword } from '../api/credentials.api.js';

const COMPLETION_KEYS = new Set([
  'mobilePhone', 'personalEmail', 'dateOfBirth', 'gender', 'maritalStatus', 'bloodGroup', 'nationality',
  'currentAddrLine1', 'currentAddrCity', 'currentAddrState', 'currentAddrZip', 'fatherName', 'motherName', 'panNumber', 'aadhaarNumber',
]);

const GROUPS = [
  { title: 'Contact', fields: [
    { k: 'mobilePhone', label: 'Mobile Phone' }, { k: 'workPhone', label: 'Work Phone' },
    { k: 'homePhone', label: 'Home Phone' }, { k: 'personalEmail', label: 'Personal Email', type: 'email' },
  ] },
  { title: 'Personal', fields: [
    { k: 'dateOfBirth', label: 'Date of Birth', type: 'date' }, { k: 'gender', label: 'Gender', master: 'gender' },
    { k: 'maritalStatus', label: 'Marital Status', master: 'maritalStatus' }, { k: 'marriageDate', label: 'Marriage Date', type: 'date' },
    { k: 'bloodGroup', label: 'Blood Group', master: 'bloodGroup' }, { k: 'nationality', label: 'Nationality' },
    { k: 'physicallyHandicapped', label: 'Physically Handicapped', options: ['No', 'Yes'] },
  ] },
  { title: 'Current Address', fields: [
    { k: 'currentAddrLine1', label: 'Address Line 1' }, { k: 'currentAddrLine2', label: 'Address Line 2' },
    { k: 'currentAddrCity', label: 'City' }, { k: 'currentAddrState', label: 'State' },
    { k: 'currentAddrZip', label: 'PIN Code' }, { k: 'currentAddrCountry', label: 'Country' },
  ] },
  { title: 'Permanent Address', fields: [
    { k: 'permanentAddrLine1', label: 'Address Line 1' }, { k: 'permanentAddrLine2', label: 'Address Line 2' },
    { k: 'permanentAddrCity', label: 'City' }, { k: 'permanentAddrState', label: 'State' },
    { k: 'permanentAddrZip', label: 'PIN Code' }, { k: 'permanentAddrCountry', label: 'Country' },
  ] },
  { title: 'Family', fields: [
    { k: 'fatherName', label: "Father's Name" }, { k: 'motherName', label: "Mother's Name" },
    { k: 'spouseName', label: 'Spouse Name' }, { k: 'childrenNames', label: "Children's Names" },
  ] },
  { title: 'Statutory', fields: [
    { k: 'panNumber', label: 'PAN Number' }, { k: 'aadhaarNumber', label: 'Aadhaar Number' },
    { k: 'pfNumber', label: 'PF Number' }, { k: 'uanNumber', label: 'UAN Number' },
  ] },
];
const SELF_KEYS = GROUPS.flatMap((g) => g.fields.map((f) => f.k));

const LOCKED = [
  ['employeeNumber', 'Employee Number'], ['jobTitle', 'Job Title'], ['tier', 'Tier'],
  ['location', 'Location'], ['country', 'Country'], ['shiftPolicy', 'Shift Policy'],
  ['weeklyOffPolicy', 'Weekly Off Policy'], ['attendanceTrackingPolicy', 'Attendance Tracking'],
  ['attendanceCaptureScheme', 'Capture Scheme'], ['holidayList', 'Holiday List'],
  ['leavePlan', 'Leave Plan'], ['expensePolicy', 'Expense Policy'], ['noticePeriod', 'Notice Period'],
];

function MiniSelect({ field, value, onChange, invalid }) {
  const opts = useQuery({ queryKey: ['activeOptions', field.master], queryFn: () => getActiveOptions(field.master), staleTime: 60_000, enabled: !!field.master });
  const values = field.options || opts.data || [];
  return (
    <select value={value || ''} onChange={(e) => onChange(e.target.value)}
      className={`w-full rounded-lg border px-3 py-2 text-sm outline-none focus:border-pine ${invalid ? 'border-brick bg-brick/5' : 'border-line'}`}>
      <option value="">—</option>
      {values.map((v) => <option key={v} value={v}>{v}</option>)}
    </select>
  );
}

export default function Profile() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [params] = useSearchParams();
  const isHr = user?.id === 'ceo' || user?.id === 'EP002' || user?.role === 'HR Head';
  const targetId = isHr ? params.get('id') : null;   // HR can view/edit someone else
  const viewingSelf = !targetId || targetId === user?.id;

  const profile = useQuery({
    queryKey: ['profile-edit', targetId || 'me'],
    queryFn: () => (targetId ? getEmployeeProfile(targetId) : getMyProfile()),
    retry: false,
  });
  const p = profile.data;
  const targetKey = targetId || user?.id;

  const [form, setForm] = useState({});
  useEffect(() => {
    if (p?.user) {
      const init = {};
      for (const k of SELF_KEYS) init[k] = p.user[k] || '';
      setForm(init);
    }
  }, [p?.user?.id]); // eslint-disable-line

  const save = useMutation({
    mutationFn: () => updateEmployeeProfile(targetKey, form),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['profile-edit'] });
      qc.invalidateQueries({ queryKey: ['profile', targetKey] });
    },
  });

  if (profile.isLoading) return <p className="text-ink-soft">Loading profile…</p>;
  if (!p) return <p className="text-brick">Couldn’t load this profile.</p>;

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));
  const pct = p.completion.pct;
  const barColor = pct >= 80 ? '#2C7A57' : pct >= 40 ? '#9A6312' : '#9C3A2A';

  return (
    <div className="mx-auto max-w-4xl space-y-4">
      {/* header + completion */}
      <div className="rounded-2xl border border-line bg-white p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="font-serif text-2xl font-bold text-pine">{viewingSelf ? 'My Profile' : p.user.name}</h1>
            <p className="text-sm text-ink-soft">{p.user.designation} · {p.user.department?.name || '—'} · {p.user.employeeNumber}</p>
          </div>
          <div className="text-right">
            <div className="text-2xl font-bold" style={{ color: barColor }}>{pct}%</div>
            <div className="text-xs text-ink-soft">complete</div>
          </div>
        </div>
        <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-paper">
          <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, background: barColor }} />
        </div>
        {p.completion.pending.length > 0 && (
          <p className="mt-2 text-xs text-brick">
            ⚠ {p.completion.pending.length} field{p.completion.pending.length === 1 ? '' : 's'} pending: {p.completion.pending.join(', ')}
          </p>
        )}
      </div>

      {/* editable groups */}
      {GROUPS.map((g) => (
        <section key={g.title} className="rounded-2xl border border-line bg-white p-5">
          <h2 className="mb-3 font-serif text-lg font-semibold text-pine">{g.title}</h2>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {g.fields.map((f) => {
              const empty = !form[f.k];
              const pending = empty && COMPLETION_KEYS.has(f.k);
              return (
                <label key={f.k} className="block text-sm">
                  <span className="text-ink-soft">{f.label}{COMPLETION_KEYS.has(f.k) && <span className="text-brick"> *</span>}</span>
                  <div className="mt-1">
                    {f.master || f.options ? (
                      <MiniSelect field={f} value={form[f.k]} onChange={(v) => set(f.k, v)} invalid={pending} />
                    ) : (
                      <input type={f.type || 'text'} value={form[f.k] || ''} onChange={(e) => set(f.k, e.target.value)}
                        className={`w-full rounded-lg border px-3 py-2 text-sm outline-none focus:border-pine ${pending ? 'border-brick bg-brick/5' : 'border-line'}`} />
                    )}
                  </div>
                </label>
              );
            })}
          </div>
        </section>
      ))}

      {/* locked job & policy fields */}
      <section className="rounded-2xl border border-line bg-white p-5">
        <div className="mb-3 flex items-center gap-2">
          <h2 className="font-serif text-lg font-semibold text-pine">Job & Policies</h2>
          <span className="rounded bg-paper px-2 py-0.5 text-[11px] text-ink-soft">🔒 HR-managed</span>
        </div>
        <div className="grid gap-x-4 gap-y-2 text-sm sm:grid-cols-2 lg:grid-cols-3">
          {LOCKED.map(([k, label]) => (
            <div key={k}>
              <dt className="text-[11px] uppercase tracking-wide text-ink-soft">{label}</dt>
              <dd className="text-ink">{p.user[k] || '—'}</dd>
            </div>
          ))}
          <div>
            <dt className="text-[11px] uppercase tracking-wide text-ink-soft">Reporting To</dt>
            <dd className="text-ink">{p.user.reportsTo?.name || '—'}</dd>
          </div>
        </div>
        {!viewingSelf && <p className="mt-3 text-xs text-ink-soft">As HR, editing these here isn’t enabled yet — use the onboarding fields or master data. Personal fields above are fully editable.</p>}
      </section>

      {save.error && <p className="rounded-lg bg-brick/5 px-4 py-2 text-sm text-brick">{save.error.response?.data?.error?.message || 'Failed to save'}</p>}

      <div className="sticky bottom-0 flex items-center justify-end gap-3 border-t border-line bg-paper/80 py-3 backdrop-blur">
        {save.isSuccess && <span className="text-sm text-sage">Saved ✓</span>}
        <button onClick={() => save.mutate()} disabled={save.isPending}
          className="rounded-lg bg-pine px-6 py-2.5 text-sm font-medium text-white disabled:opacity-50">
          {save.isPending ? 'Saving…' : 'Save changes'}
        </button>
      </div>

      {viewingSelf && <ChangePassword />}
    </div>
  );
}

function ChangePassword() {
  const [cur, setCur] = useState('');
  const [nw, setNw] = useState('');
  const mut = useMutation({ mutationFn: () => changeOwnPassword(cur, nw), onSuccess: () => { setCur(''); setNw(''); } });
  return (
    <section className="rounded-2xl border border-line bg-white p-5">
      <h2 className="font-serif text-lg font-semibold text-pine">Change Password</h2>
      <div className="mt-3 grid max-w-lg gap-3 sm:grid-cols-2">
        <label className="block text-sm"><span className="text-ink-soft">Current password</span>
          <input type="password" value={cur} onChange={(e) => setCur(e.target.value)} className="mt-1 w-full rounded-lg border border-line px-3 py-2 text-sm outline-none focus:border-pine" />
        </label>
        <label className="block text-sm"><span className="text-ink-soft">New password</span>
          <input type="password" value={nw} onChange={(e) => setNw(e.target.value)} className="mt-1 w-full rounded-lg border border-line px-3 py-2 text-sm outline-none focus:border-pine" />
        </label>
      </div>
      {mut.error && <p className="mt-2 text-sm text-brick">{mut.error.response?.data?.error?.message || 'Failed'}</p>}
      {mut.isSuccess && <p className="mt-2 text-sm text-sage">Password updated ✓</p>}
      <button onClick={() => mut.mutate()} disabled={!cur || !nw || mut.isPending}
        className="mt-3 rounded-lg bg-pine px-4 py-2 text-sm font-medium text-white disabled:opacity-50">Update password</button>
    </section>
  );
}
