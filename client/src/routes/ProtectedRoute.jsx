import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../store/AuthContext.jsx';

export default function ProtectedRoute({ children }) {
  const { user, bootstrapping } = useAuth();
  const location = useLocation();

  if (bootstrapping) {
    return <div className="p-10 text-sm text-ink-soft">Loading…</div>;
  }
  if (!user) {
    // Remember where they were headed (incl. deep-link query) so login returns there.
    return <Navigate to="/login" replace state={{ from: location }} />;
  }
  return children;
}
