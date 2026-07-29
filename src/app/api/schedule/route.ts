import { schedule } from '../../../server/dashboard/queries.ts';

export const dynamic = 'force-dynamic';

export function GET(): Response {
  return Response.json(schedule(Date.now()));
}
