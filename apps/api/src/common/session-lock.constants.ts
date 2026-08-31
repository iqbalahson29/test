/**
 * How long an attempt's session lock stays "live" after its last heartbeat.
 * A lock older than this is treated as abandoned (crashed tab, dead wifi):
 * AuthService stops refusing new logins for that student, and
 * AttemptsService lets a fresh session reclaim the attempt. Comfortably
 * above the frontend's heartbeat interval so a couple of missed pings don't
 * cost the student their session.
 */
export const SESSION_LOCK_TIMEOUT_MS = 90_000;
