import { config, settings } from '../../../server/dashboard/context.ts';

export const dynamic = 'force-dynamic';

export function GET(): Response {
  return Response.json({
    schedule: settings.schedule(config.schedule),
    defaults: config.schedule,
    updatedAt: settings.updatedAt('schedule'),
  });
}

/**
 * The maker sets the pace. Values are clamped rather than trusted — this screen
 * has no authentication, and the scheduler decides how much of the month's
 * subscription gets spent.
 */
export async function PUT(request: Request): Promise<Response> {
  const body = (await request.json().catch(() => ({}))) as { schedule?: unknown };
  const schedule = settings.setSchedule(body.schedule, config.schedule, Date.now());
  return Response.json({ schedule, defaults: config.schedule, updatedAt: Date.now() });
}
