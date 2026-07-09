import { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { refreshAccessToken, setOnAuthFailure } from '../api/client.js';
import * as authApi from '../api/auth.api.js';

const AuthContext = createContext(null);
export const useAuth = () => useContext(AuthContext);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [bootstrapping, setBootstrapping] = useState(true);

  // On load, try to restore the session from the refresh cookie (silent login).
  useEffect(() => {
    setOnAuthFailure(() => setUser(null));
    (async () => {
      try {
        const { user } = await refreshAccessToken();
        setUser(user);
      } catch {
        setUser(null); // no valid session → will land on /login
      } finally {
        setBootstrapping(false);
      }
    })();
  }, []);

  const login = useCallback(async (username, password) => {
    const u = await authApi.login(username, password);
    setUser(u);
    return u;
  }, []);

  const logout = useCallback(async () => {
    await authApi.logout();
    setUser(null);
  }, []);

  return (
    <AuthContext.Provider value={{ user, login, logout, bootstrapping }}>
      {children}
    </AuthContext.Provider>
  );
}
