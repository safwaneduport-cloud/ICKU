import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../store/AuthContext.jsx';

// Neutral demo accounts (kept out of the public repo's real-name space).
// Local dev with the imported org uses its own logins instead.
const DEMO = [
  { u: 'ceo', p: 'ceo@123', label: 'CEO', sub: 'Full admin' },
  { u: 'cos', p: 'cos@123', label: 'Chief of Staff', sub: 'Ops & media' },
  { u: 'coursemgr', p: 'cm@123', label: 'Course Manager', sub: 'Class 7,8' },
  { u: 'hod78', p: 'hod@123', label: 'Academic HOD', sub: 'Class 7,8' },
  { u: 'hrhead', p: 'hr@123', label: 'HR Head', sub: 'Admin access' },
];

export default function Login() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      await login(username, password);
      navigate('/', { replace: true });
    } catch (err) {
      setError(err.response?.data?.error?.message || 'Login failed. Please try again.');
    } finally {
      setBusy(false);
    }
  };

  const fillDemo = (d) => {
    setUsername(d.u);
    setPassword(d.p);
  };

  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <div className="w-full max-w-md">
        <div className="mb-6 text-center">
          <div className="text-[11px] font-mono uppercase tracking-widest text-ochre">
            Integrated Company Knowledge &amp; Operations
          </div>
          <h1 className="mt-1 font-serif text-4xl font-bold text-pine">ICKU</h1>
        </div>

        <form onSubmit={submit} className="rounded-2xl border border-line bg-white p-6 shadow-sm">
          <h2 className="font-serif text-lg font-semibold">Sign in</h2>

          <label className="mt-4 block text-sm">
            <span className="text-ink-soft">Username</span>
            <input
              className="mt-1 w-full rounded-lg border border-line px-3 py-2 outline-none focus:border-pine"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="e.g. ceo"
              autoFocus
            />
          </label>

          <label className="mt-3 block text-sm">
            <span className="text-ink-soft">Password</span>
            <input
              type="password"
              className="mt-1 w-full rounded-lg border border-line px-3 py-2 outline-none focus:border-pine"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••"
            />
          </label>

          {error && (
            <p className="mt-3 rounded-lg bg-brick-tint px-3 py-2 text-sm text-brick">{error}</p>
          )}

          <button
            type="submit"
            disabled={busy}
            className="mt-4 w-full rounded-lg bg-pine py-2.5 font-medium text-white transition hover:opacity-90 disabled:opacity-60"
          >
            {busy ? 'Signing in…' : 'Sign in'}
          </button>
        </form>

        <div className="mt-5">
          <div className="mb-2 text-center text-xs uppercase tracking-wide text-ink-soft">
            Demo accounts — click to fill
          </div>
          <div className="flex flex-wrap justify-center gap-2">
            {DEMO.map((d) => (
              <button
                key={d.u}
                onClick={() => fillDemo(d)}
                className="rounded-lg border border-line bg-white px-3 py-1.5 text-left text-xs hover:border-pine"
              >
                <div className="font-medium text-ink">{d.label}</div>
                <div className="font-mono text-[10px] text-ink-soft">{d.u} · {d.sub}</div>
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
