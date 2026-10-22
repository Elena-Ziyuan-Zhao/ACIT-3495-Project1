'use strict';

const MIN_DURATION = 1;
const MAX_DURATION = 600;
const INTEGER_PATTERN = /^\d+$/;

// Form fields arrive as strings. Only plain positive integers are accepted
// ("12.5", "1e2", " 5", "-3" are all rejected).
function validateEntry(body) {
  const rawRoute = typeof body.route_id === 'string' ? body.route_id.trim() : '';
  const rawDuration = typeof body.duration_minutes === 'string' ? body.duration_minutes.trim() : '';

  if (!INTEGER_PATTERN.test(rawRoute) || Number(rawRoute) < 1) {
    return { ok: false, error: 'Please choose a valid route.' };
  }
  if (!INTEGER_PATTERN.test(rawDuration)) {
    return { ok: false, error: `Duration must be a whole number between ${MIN_DURATION} and ${MAX_DURATION}.` };
  }
  const duration = Number(rawDuration);
  if (duration < MIN_DURATION || duration > MAX_DURATION) {
    return { ok: false, error: `Duration must be a whole number between ${MIN_DURATION} and ${MAX_DURATION}.` };
  }
  return { ok: true, routeId: Number(rawRoute), duration };
}

module.exports = { validateEntry, MIN_DURATION, MAX_DURATION };