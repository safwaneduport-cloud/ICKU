import { createContext, useContext, useState, useCallback } from 'react';
import ProfileDrawer from '../features/people/ProfileDrawer.jsx';

// Global "click a person → see their profile" drawer. Any component can call
// openProfile(userId) without threading props; the drawer renders once at the shell.
const ProfileContext = createContext(null);
export const useProfile = () => useContext(ProfileContext);

export function ProfileProvider({ children }) {
  const [userId, setUserId] = useState(null);
  const openProfile = useCallback((id) => setUserId(id), []);
  const closeProfile = useCallback(() => setUserId(null), []);

  return (
    <ProfileContext.Provider value={{ openProfile, closeProfile }}>
      {children}
      <ProfileDrawer userId={userId} onClose={closeProfile} onNavigate={openProfile} />
    </ProfileContext.Provider>
  );
}
