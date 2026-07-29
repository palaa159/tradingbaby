import { diaryFor } from '../../../server/dashboard/queries.ts';

export const dynamic = 'force-dynamic';

export function GET(request: Request): Response {
  const studentId = new URL(request.url).searchParams.get('student');
  if (!studentId) return Response.json({ error: 'student required' }, { status: 400 });
  return Response.json(diaryFor(studentId));
}
