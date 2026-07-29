import { sdkCalls } from '../../../server/dashboard/queries.ts';

export const dynamic = 'force-dynamic';

export function GET(request: Request): Response {
  const studentId = new URL(request.url).searchParams.get('student');
  return Response.json(sdkCalls(studentId));
}
