import { brainAt } from '../../../server/dashboard/queries.ts';

export const dynamic = 'force-dynamic';

export function GET(request: Request): Response {
  const url = new URL(request.url);
  const studentId = url.searchParams.get('student');
  if (!studentId) return Response.json({ error: 'student required' }, { status: 400 });
  const atParam = url.searchParams.get('at');
  return Response.json(brainAt(studentId, atParam ? Number(atParam) : Infinity));
}
