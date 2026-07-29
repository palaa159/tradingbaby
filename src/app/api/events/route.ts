import { eventStream } from '../../../server/dashboard/queries.ts';

export const dynamic = 'force-dynamic';

export function GET(request: Request): Response {
  const url = new URL(request.url);
  const limit = Math.min(1000, Math.max(1, Number(url.searchParams.get('limit') ?? 300)));
  return Response.json(
    eventStream(url.searchParams.get('student'), limit, url.searchParams.get('type')),
  );
}
