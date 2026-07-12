import express from 'express';
import cors from 'cors';
import morgan from 'morgan';
import cookieParser from 'cookie-parser';
import path from 'path';
import { fileURLToPath } from 'url';

import { env } from './config/env.js';
import { notFound } from './middleware/notFound.js';
import { errorHandler } from './middleware/errorHandler.js';
import { authenticate } from './middleware/authenticate.js';

import healthRoutes from './modules/health/health.routes.js';
import authRoutes from './modules/auth/auth.routes.js';
import departmentRoutes from './modules/departments/departments.routes.js';
import userRoutes from './modules/users/users.routes.js';
import attendanceRoutes from './modules/attendance/attendance.routes.js';
import leaveRoutes from './modules/leave/leave.routes.js';
import payrollRoutes from './modules/payroll/payroll.routes.js';
import expenseRoutes from './modules/expenses/expenses.routes.js';
import assetRoutes from './modules/assets/assets.routes.js';
import helpdeskRoutes from './modules/helpdesk/helpdesk.routes.js';
import eventRoutes from './modules/events/events.routes.js';
import onboardingRoutes from './modules/onboarding/onboarding.routes.js';
import exitRoutes from './modules/exit/exit.routes.js';
import adminRoutes from './modules/admin/admin.routes.js';
import reportRoutes from './modules/reports/reports.routes.js';
import knowledgeRoutes from './modules/knowledge/knowledge.routes.js';
import engagementRoutes from './modules/engagement/engagement.routes.js';
import dashboardRoutes from './modules/dashboard/dashboard.routes.js';
import announcementRoutes from './modules/announcements/announcements.routes.js';
import personalRoutes from './modules/personal/personal.routes.js';
import meetingRoutes from './modules/meetings/meetings.routes.js';
import workspaceRoutes from './modules/workspaces/workspaces.routes.js';
import notificationRoutes from './modules/notifications/notifications.routes.js';
import messageRoutes from './modules/messages/messages.routes.js';
import masterRoutes from './modules/masters/masters.routes.js';
import credentialRoutes from './modules/credentials/credentials.routes.js';

export const app = express();

// Behind Render's proxy — required so Secure cookies are set over the proxied HTTPS.
if (env.nodeEnv === 'production') app.set('trust proxy', 1);

// core middleware
app.use(cors({ origin: env.corsOrigin || true, credentials: true }));
app.use(express.json());
app.use(cookieParser());
if (env.nodeEnv !== 'test') app.use(morgan('dev'));

// API routes (versioned)
const api = express.Router();
api.use('/health', healthRoutes);          // public
api.use('/auth', authRoutes);              // public (login/refresh/logout) + /me (guarded inside)
api.use('/departments', authenticate, departmentRoutes);  // protected
api.use('/users', authenticate, userRoutes);              // protected
api.use('/attendance', authenticate, attendanceRoutes);   // protected
api.use('/leave', authenticate, leaveRoutes);             // protected
api.use('/payroll', authenticate, payrollRoutes);         // protected
api.use('/expenses', authenticate, expenseRoutes);        // protected
api.use('/assets', authenticate, assetRoutes);            // protected
api.use('/helpdesk', authenticate, helpdeskRoutes);       // protected
api.use('/events', authenticate, eventRoutes);            // protected
api.use('/onboarding', authenticate, onboardingRoutes);   // protected
api.use('/exit', authenticate, exitRoutes);               // protected
api.use('/admin', authenticate, adminRoutes);             // protected (admin-gated inside)
api.use('/reports', authenticate, reportRoutes);          // protected (reports-gated inside)
api.use('/knowledge', authenticate, knowledgeRoutes);     // protected
api.use('/engagement', authenticate, engagementRoutes);   // protected
api.use('/dashboard', authenticate, dashboardRoutes);     // protected
api.use('/announcements', authenticate, announcementRoutes); // protected
api.use('/personal', authenticate, personalRoutes);       // protected
api.use('/meetings', authenticate, meetingRoutes);        // protected
api.use('/workspaces', authenticate, workspaceRoutes);    // protected
api.use('/notifications', authenticate, notificationRoutes); // protected
api.use('/messages', authenticate, messageRoutes);        // protected
api.use('/masters', authenticate, masterRoutes);          // protected (HR-gated inside)
api.use('/credentials', authenticate, credentialRoutes);  // protected (HR-gated + self change-password)
app.use('/api/v1', api);

// Unknown /api routes → JSON 404 (never fall through to the SPA).
app.use('/api', notFound);

// In production, serve the built React app and let client-side routing handle
// everything that isn't an API call (single-service deploy).
if (env.nodeEnv === 'production') {
  const __dirname = path.dirname(fileURLToPath(import.meta.url));
  const clientDist = path.resolve(__dirname, '../../client/dist');
  app.use(express.static(clientDist));
  app.get('*', (req, res) => res.sendFile(path.join(clientDist, 'index.html')));
} else {
  app.use(notFound);
}

app.use(errorHandler);
