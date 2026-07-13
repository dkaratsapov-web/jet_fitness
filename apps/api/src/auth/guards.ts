// Shared route guards, reused across coach-scoped route files.

import type { FastifyReply, FastifyRequest } from 'fastify';

/**
 * Require the request to be an authenticated coach.
 * Returns false (and sends 403) when the caller is not a coach, so callers do:
 *   if (!(await requireCoach(request, reply))) return;
 */
export async function requireCoach(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<boolean> {
  const auth = request.auth!;
  if (!auth.isCoach) {
    reply.code(403).send({ error: 'forbidden', reason: 'not_a_coach' });
    return false;
  }
  return true;
}
