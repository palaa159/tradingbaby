import { activityFeed } from '../../../server/dashboard/queries.ts';

export const dynamic = 'force-dynamic';

export function GET(request: Request): Response {
  const limit = Math.min(500, Math.max(1, Number(new URL(request.url).searchParams.get('limit') ?? 200)));
  return Response.json(activityFeed(limit));
}
