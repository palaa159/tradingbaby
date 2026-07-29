import { isLogName, tail, tailAll } from '../../../server/dashboard/processLogs.ts';

export const dynamic = 'force-dynamic';

export async function GET(request: Request): Promise<Response> {
  const name = new URL(request.url).searchParams.get('name');
  // Unknown names fall through to the whole set rather than being echoed back
  // into a file path — the whitelist is the only thing that resolves.
  if (name && isLogName(name)) {
    return Response.json({ logs: [await tail(name, 400)] });
  }
  return Response.json({ logs: await tailAll(80) });
}
