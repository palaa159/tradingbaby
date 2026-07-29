import { examView } from '../../../server/dashboard/queries.ts';

export const dynamic = 'force-dynamic';

export function GET(request: Request): Response {
  return Response.json(examView(new URL(request.url).searchParams.get('student')));
}
