import { events, students } from '../../../server/dashboard/context.ts';
import { requestBox } from '../../../server/dashboard/queries.ts';
import { updateNode } from '../../../server/engine/graphOps.ts';

export const dynamic = 'force-dynamic';

export function GET(): Response {
  return Response.json(requestBox());
}

/**
 * The maker marks a request answered. This is the one write into a student's
 * graph the maker is allowed, and it is deliberately narrow: only the status of
 * a request the student itself filed, never its knowledge (spec §8).
 */
export async function PATCH(request: Request): Promise<Response> {
  const body = (await request.json().catch(() => ({}))) as { id?: unknown; studentId?: unknown };
  const id = typeof body.id === 'string' ? body.id : '';
  const studentId = typeof body.studentId === 'string' ? body.studentId : '';
  if (!id || !studentId) return Response.json({ error: 'id and studentId required' }, { status: 400 });
  if (!students.list().some((s) => s.id === studentId)) {
    return Response.json({ error: 'unknown student' }, { status: 404 });
  }
  if (!id.startsWith('feature_request')) {
    return Response.json({ error: 'only feature requests can be answered here' }, { status: 400 });
  }

  updateNode(
    { studentId, store: events, now: Date.now },
    { nodeId: id, status: 'answered' },
  );
  return Response.json({ ok: true });
}
