import { Routes, Route, Navigate } from 'react-router-dom';
import Login from './pages/Login.jsx';
import ProtectedRoute from './routes/ProtectedRoute.jsx';
import AppShell from './layouts/AppShell.jsx';
import Overview from './pages/Overview.jsx';
import Organization from './pages/Organization.jsx';
import Attendance from './pages/Attendance.jsx';
import Leave from './pages/Leave.jsx';
import Payroll from './pages/Payroll.jsx';
import Expenses from './pages/Expenses.jsx';
import Assets from './pages/Assets.jsx';
import Helpdesk from './pages/Helpdesk.jsx';
import Events from './pages/Events.jsx';
import Approvals from './pages/Approvals.jsx';
import Onboarding from './pages/Onboarding.jsx';
import Exit from './pages/Exit.jsx';
import Admin from './pages/Admin.jsx';
import Reports from './pages/Reports.jsx';
import Knowledge from './pages/Knowledge.jsx';
import Engagement from './pages/Engagement.jsx';
import Announcements from './pages/Announcements.jsx';
import Okrs from './pages/Okrs.jsx';
import Meetings from './pages/Meetings.jsx';
import Workspaces from './pages/Workspaces.jsx';
import Messages from './pages/Messages.jsx';
import MasterData from './pages/MasterData.jsx';
import Credentials from './pages/Credentials.jsx';
import OnboardEmployee from './pages/OnboardEmployee.jsx';

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />

      {/* Everything below requires a logged-in user */}
      <Route
        path="/"
        element={
          <ProtectedRoute>
            <AppShell />
          </ProtectedRoute>
        }
      >
        <Route index element={<Overview />} />
        <Route path="messages" element={<Messages />} />
        <Route path="master-data" element={<MasterData />} />
        <Route path="credentials" element={<Credentials />} />
        <Route path="onboard-employee" element={<OnboardEmployee />} />
        <Route path="events" element={<Events />} />
        <Route path="okrs" element={<Okrs />} />
        <Route path="meetings" element={<Meetings />} />
        <Route path="workspaces" element={<Workspaces />} />
        <Route path="approvals" element={<Approvals />} />
        <Route path="attendance" element={<Attendance />} />
        <Route path="leave" element={<Leave />} />
        <Route path="payroll" element={<Payroll />} />
        <Route path="onboarding" element={<Onboarding />} />
        <Route path="exit" element={<Exit />} />
        <Route path="expenses" element={<Expenses />} />
        <Route path="assets" element={<Assets />} />
        <Route path="helpdesk" element={<Helpdesk />} />
        <Route path="admin" element={<Admin />} />
        <Route path="reports" element={<Reports />} />
        <Route path="knowledge" element={<Knowledge />} />
        <Route path="engagement" element={<Engagement />} />
        <Route path="announcements" element={<Announcements />} />
        <Route path="org" element={<Organization />} />
      </Route>

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
