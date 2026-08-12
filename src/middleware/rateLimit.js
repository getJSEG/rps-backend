/**
 * Minimal in-memory fixed-window rate limiter.
 *
 * The project runs a single Node process and has no Redis, so counters live in a Map that is
 * swept lazily on each request. Restarting the server resets the windows; that is acceptable
 * for the abuse this guards against (password reset spam), not for anything billable.
 */

function defaultKeyFn(req) {
  return req.ip || req.connection?.remoteAddress || 'unknown';
}

function createRateLimiter({
  windowMs = 15 * 60 * 1000,
  max = 5,
  keyFn = defaultKeyFn,
  message = 'Too many requests. Please try again later.',
} = {}) {
  const hits = new Map();
  let lastSweep = Date.now();

  function sweep(now) {
    if (now - lastSweep < windowMs) return;
    lastSweep = now;
    for (const [key, entry] of hits) {
      if (entry.resetAt <= now) hits.delete(key);
    }
  }

  return function rateLimit(req, res, next) {
    const now = Date.now();
    sweep(now);

    const key = String(keyFn(req) || 'unknown');
    const entry = hits.get(key);

    if (!entry || entry.resetAt <= now) {
      hits.set(key, { count: 1, resetAt: now + windowMs });
      return next();
    }

    entry.count += 1;
    if (entry.count > max) {
      const retryAfter = Math.ceil((entry.resetAt - now) / 1000);
      res.set('Retry-After', String(retryAfter));
      return res.status(429).json({ message });
    }
    return next();
  };
}

module.exports = { createRateLimiter };
