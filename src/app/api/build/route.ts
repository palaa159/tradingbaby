import { buildInfo } from '../../../server/dashboard/buildInfo.ts';

export const dynamic = 'force-dynamic';

export async function GET(): Promise<Response> {
  return Response.json(await buildInfo());
}
