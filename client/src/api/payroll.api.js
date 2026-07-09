import { api } from './client.js';

export const getAccess = () => api.get('/payroll/access').then((r) => r.data.data);
export const getPayslip = (year, month) =>
  api.get('/payroll/payslip', { params: { year, month } }).then((r) => r.data.data);
export const getRun = (year, month) =>
  api.get('/payroll/run', { params: { year, month } }).then((r) => r.data.data);
export const processRun = (year, month) =>
  api.post('/payroll/run/process', { year, month }).then((r) => r.data.data);
export const getCompliance = (year, month) =>
  api.get('/payroll/compliance', { params: { year, month } }).then((r) => r.data.data);
