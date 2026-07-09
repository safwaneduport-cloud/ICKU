import { env } from '../config/env.js';

// A small helper so services can throw errors with an HTTP status.
export class ApiError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

// Central error handler — every thrown error ends up here as consistent JSON.
// eslint-disable-next-line no-unused-vars
export function errorHandler(err, req, res, next) {
  const status = err.status || 500;
  const payload = { data: null, error: { message: err.message || 'Internal Server Error' } };
  if (env.nodeEnv !== 'production' && status >= 500) payload.error.stack = err.stack;
  if (status >= 500) console.error(err);
  res.status(status).json(payload);
}
