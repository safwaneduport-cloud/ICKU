export function notFound(req, res, next) {
  res.status(404).json({ data: null, error: { message: `Route not found: ${req.method} ${req.originalUrl}` } });
}
