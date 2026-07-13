import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../store/AuthContext.jsx';

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
              placeholder="your work username"
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

          <p className="mt-4 text-center text-xs text-ink-soft">
            Use the credentials shared with you by HR. First time in? Change your
            password under <span className="font-medium">Profile</span> after signing in.
          </p>
        </form>
      </div>
    </div>
  );
}
