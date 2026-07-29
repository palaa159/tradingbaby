import { evaluationLog } from '../../../server/dashboard/queries.ts';

export const dynamic = 'force-dynamic';

export function GET(request: Request): Response {
  return Response.json(evaluationLog(new URL(request.url).searchParams.get('student')));
}
