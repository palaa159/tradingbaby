import { designLog } from '../../../server/dashboard/context.ts';

export const dynamic = 'force-dynamic';

export function GET(): Response {
  return Response.json({ rounds: designLog.recent(30) });
}
