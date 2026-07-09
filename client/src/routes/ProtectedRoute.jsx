import { Navigate } from 'react-router-dom';
import { useAuth } from '../store/AuthContext.jsx';

export default function ProtectedRoute({ children }) {
  const { user, bootstrapping } = useAuth();

  if (bootstrapping) {
    return <div className="p-10 text-sm text-ink-soft">Loading…</div>;
  }
  if (!user) {
    return <Navigate to="/login" replace />;
  }
  return children;
}
