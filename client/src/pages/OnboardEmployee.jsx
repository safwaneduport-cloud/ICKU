import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useMutation } from '@tanstack/react-query';
import { useAuth } from '../store/AuthContext.jsx';
import { getActiveOptions } from '../api/masters.api.js';
import { getDepartments } from '../api/departments.api.js';
import { getUsers } from '../api/users.api.js';
import { onboardEmployee } from '../api/employees.api.js';

// Field layout for the onboarding form. `master` = dropdown from master data,
// `dept`/`person` = special sources, `req` = mandatory (Part 4).
const SECTIONS = [
  {
    title: 'Identity',
    fields: [
      { k: 'employeeNumber', label: 'Employee Number', req: true },
      { k: 'workEmail', label: 'Work Email', req: true, type: 'email' },
      { k: 'firstName', label: 'First Name', req: true },
      { k: 'middleName', label: 'Middle Name', req: true },
      { k: 'lastName', label: 'Last Name', req: true },
      { k: 'displayName', label: 'Display Name', req: true },
      { k: 'fullName', label: 'Full Name', req: true },
      { k: 'mobilePhone', label: 'Mobile Phone', req: true },
    ],
  },
  {
    title: 'Role & Organisation',
    fields: [
      { k: 'department', label: 'Department', req: true, dept: true },
      { k: 'subDepartment', label: 'Sub Department', master: 'subDepartment' },
      { k: 'jobTitle', label: 'Job Title', req: true, master: 'jobTitle' },
      { k: 'secondaryJobTitle', label: 'Secondary Job Title', master: 'jobTitle' },
      { k: 'tier', label: 'Tier', req: true, master: 'tier' },
      { k: 'reportsToId', label: 'Reporting To', req: true, person: true },
      { k: 'dottedLineManager', label: 'Dotted Line Manager' },
      { k: 'location', label: 'Location', master: 'location' },
      { k: 'country', label: 'Country', master: 'country' },
      { k: 'dateJoined', label: 'Date Joined', type: 'date' },
    ],
  },
  {
    title: 'Policies',
    fields: [
      { k: 'shiftPolicy', label: 'Shift Policy', req: true, master: 'shiftPolicy' },
      { k: 'weeklyOffPolicy', label: 'Weekly Off Policy', req: true, master: 'weeklyOffPolicy' },
      { k: 'attendanceTrackingPolicy', label: 'Attendance Time Tracking Policy', req: true, master: 'attendanceTrackingPolicy' },
      { k: 'attendanceCaptureScheme', label: 'Attendance Capture Scheme', req: true, master: 'attendanceCaptureScheme' },
      { k: 'holidayList', label: 'Holiday List', req: true, master: 'holidayList' },
      { k: 'leavePlan', label: 'Leave Plan', master: 'leavePlan' },
      { k: 'expensePolicy', label: 'Expense Policy', master: 'expensePolicy' },
      { k: 'noticePeriod', label: 'Notice Period', master: 'noticePeriod' },
      { k: 'workerType', label: 'Worker Type', master: 'workerType' },
      { k: 'timeType', label: 'Time Type', master: 'timeType' },
      { k: 'band', label: 'Band', master: 'band' },
      { k: 'payGrade', label: 'Pay Grade', master: 'payGrade' },
    ],
  },
];
const ALL_FIELDS = SECTIONS.flatMap((s) => s.fields);
const REQUIRED = ALL_FIELDS.filter((f) => f.req).map((f) => f.k);

function MasterField({ field, value, onChange, invalid }) {
  const opts = useQuery({
    queryKey: field.dept ? ['departments'] : ['activeOptions', field.master],
    queryFn: field.dept ? getDepartments : () => getActiveOptions(field.master),
    staleTime: 60_000,
  });
  const values = field.dept ? (opts.data || []).map((d) => d.name) : (opts.data || []);
  return (
    <select value={value || ''} onChange={(e) => onChange(e.target.value)}
      className={`w-full rounded-lg border px-3 py-2 text-sm outline-none focus:border-pine ${invalid ? 'border-brick' : 'border-line'}`}>
      <option value="">Select…</option>
      {values.map((v) => <option key={v} value={v}>{v}</option>)}
    </select>
  );
}

export default function OnboardEmployee() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const isHr = user?.id === 'ceo' || user?.id === 'EP002' || user?.role === 'HR Head';
  const [form, setForm] = useState({});
  const [touched, setTouched] = useState(false);
  const [created, setCreated] = useState(null);

  const users = useQuery({ queryKey: ['users'], queryFn: getUsers, retry: false, enabled: isHr });
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));
  const missing = REQUIRED.filter((k) => !form[k] || !String(form[k]).trim());

  const mut = useMutation({
    mutationFn: () => onboardEmployee(form),
    onSuccess: (r) => setCreated(r),
  });
  const submit = () => { setTouched(true); if (missing.length === 0) mut.mutate(); };

  if (!isHr) {
    return (
      <div className="space-y-2">
        <h1 className="font-serif text-3xl font-bold text-pine">Onboard Employee</h1>
        <p className="text-sm text-ink-soft">Only HR and Admin can create employees.</p>
      </div>
    );
  }

  if (created) {
    return (
      <div className="mx-auto max-w-lg space-y-4">
        <div className="rounded-2xl border border-sage/40 bg-sage-tint/40 p-6 text-center">
          <div className="text-3xl">✅</div>
          <h1 className="mt-2 font-serif text-2xl font-bold text-pine">{created.name} onboarded</h1>
          <p className="mt-1 text-sm text-ink-soft">Their login has been created.</p>
          <div className="mx-auto mt-4 w-fit rounded-xl border border-line bg-white px-6 py-4 text-left text-sm">
            <div><span className="text-ink-soft">Username:</span> <span className="font-mono font-semibold">{created.username}</span></div>
            <div className="mt-1"><span className="text-ink-soft">Temp password:</span> <span className="font-mono font-semibold">{created.tempPassword}</span></div>
          </div>
        </div>
        <div className="flex justify-center gap-2">
          <button onClick={() => { setCreated(null); setForm({}); setTouched(false); }} className="rounded-lg bg-pine px-4 py-2 text-sm font-medium text-white">Onboard another</button>
          <button onClick={() => navigate('/org')} className="rounded-lg border border-line px-4 py-2 text-sm">View directory</button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-baseline justify-between">
        <div>
          <h1 className="font-serif text-3xl font-bold text-pine">Onboard Employee</h1>
          <p className="text-sm text-ink-soft">Fields marked <span className="text-brick">*</span> are mandatory. The rest can be completed later by HR or the employee.</p>
        </div>
        <button onClick={() => navigate(-1)} className="rounded-lg border border-line px-3 py-1.5 text-sm">Cancel</button>
      </div>

      {SECTIONS.map((section) => (
        <section key={section.title} className="rounded-2xl border border-line bg-white p-5">
          <h2 className="mb-3 font-serif text-lg font-semibold text-pine">{section.title}</h2>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {section.fields.map((f) => {
              const invalid = touched && f.req && (!form[f.k] || !String(form[f.k]).trim());
              return (
                <label key={f.k} className="block text-sm">
                  <span className="text-ink-soft">{f.label} {f.req && <span className="text-brick">*</span>}</span>
                  <div className="mt-1">
                    {f.master || f.dept ? (
                      <MasterField field={f} value={form[f.k]} onChange={(v) => set(f.k, v)} invalid={invalid} />
                    ) : f.person ? (
                      <select value={form[f.k] || ''} onChange={(e) => set(f.k, e.target.value)}
                        className={`w-full rounded-lg border px-3 py-2 text-sm outline-none focus:border-pine ${invalid ? 'border-brick' : 'border-line'}`}>
                        <option value="">Select manager…</option>
                        {(users.data || []).map((u) => <option key={u.id} value={u.id}>{u.name} ({u.employeeNumber || u.id})</option>)}
                      </select>
                    ) : (
                      <input type={f.type || 'text'} value={form[f.k] || ''} onChange={(e) => set(f.k, e.target.value)}
                        className={`w-full rounded-lg border px-3 py-2 text-sm outline-none focus:border-pine ${invalid ? 'border-brick' : 'border-line'}`} />
                    )}
                  </div>
                </label>
              );
            })}
          </div>
        </section>
      ))}

      {mut.error && <p className="rounded-lg bg-brick/5 px-4 py-2 text-sm text-brick">{mut.error.response?.data?.error?.message || 'Failed to create employee'}</p>}
      {touched && missing.length > 0 && <p className="text-sm text-brick">{missing.length} mandatory field{missing.length === 1 ? '' : 's'} still required.</p>}

      <div className="sticky bottom-0 flex items-center justify-end gap-2 border-t border-line bg-paper/80 py-3 backdrop-blur">
        <button onClick={submit} disabled={mut.isPending}
          className="rounded-lg bg-pine px-6 py-2.5 text-sm font-medium text-white disabled:opacity-50">
          {mut.isPending ? 'Creating…' : 'Create employee + login'}
        </button>
      </div>
    </div>
  );
}
