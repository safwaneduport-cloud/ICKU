import { hasCapability } from '../lib/rbac.js';
import { isManagerOf } from '../lib/orgTree.js';
import { ApiError } from './errorHandler.js';

// Layer (a): capability check — does this user's tier allow `cap`?
export function requireCapability(cap) {
  return (req, res, next) => {
    if (!req.user) return next(new ApiError(401, 'Not authenticated'));
    if (!hasCapability(req.user.tier, cap)) {
      return next(new ApiError(403, `Requires '${cap}' capability`));
    }
    next();
  };
}

// Layer (b): relationship check — the viewer must be the target OR a manager
// (direct/indirect) of the target user identified by a route param.
export function requireSelfOrManager(paramName = 'id') {
  return async (req, res, next) => {
    try {
      if (!req.user) throw new ApiError(401, 'Not authenticated');
      const targetId = req.params[paramName];
      if (req.user.id === targetId) return next();
      if (await isManagerOf(req.user.id, targetId)) return next();
      throw new ApiError(403, 'Not permitted for this user');
    } catch (err) {
      next(err);
    }
  };
}
