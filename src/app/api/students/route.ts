import { classroom, rosterView } from '../../../server/dashboard/queries.ts';
import { config, roster } from '../../../server/dashboard/context.ts';

export const dynamic = 'force-dynamic';

export function GET(request: Request): Response {
  // ?roster=1 is the maker's management view; the default stays the classroom
  // read model every other screen already consumes.
  const manage = new URL(request.url).searchParams.get('roster');
  return Response.json(manage ? rosterView() : classroom());
}

/** Enrol a student. The seed is the identity — personality is derived from it. */
export async function POST(request: Request): Promise<Response> {
  const body = (await request.json().catch(() => ({}))) as { name?: unknown; seed?: unknown };
  const name = typeof body.name === 'string' ? body.name.trim() : '';
  const seed = typeof body.seed === 'string' ? body.seed.trim() : '';
  if (!name || !seed) {
    return Response.json({ error: 'name and seed are required' }, { status: 400 });
  }
  if (roster.get(seed)) {
    return Response.json({ error: 'seed already enrolled' }, { status: 409 });
  }
  const student = roster.enroll(seed, name, config.metabolism.startingAllowance, Date.now());
  return Response.json({ student: { id: student.id, name: student.name } }, { status: 201 });
}

type Action = 'rename' | 'suspend' | 'revive' | 'expel' | 'readmit';

/**
 * Lifecycle only. Nothing here writes to a student's knowledge — the maker
 * observes brains and never edits them (spec §8), and expulsion is a flag
 * rather than a delete so old decisions stay explainable (§9.5).
 */
export async function PATCH(request: Request): Promise<Response> {
  const body = (await request.json().catch(() => ({}))) as {
    id?: unknown;
    action?: unknown;
    name?: unknown;
  };
  const id = typeof body.id === 'string' ? body.id : '';
  const action = body.action as Action;
  if (!id || !roster.get(id)) return Response.json({ error: 'unknown student' }, { status: 404 });

  const allowance = config.metabolism.startingAllowance;
  const at = Date.now();

  switch (action) {
    case 'rename': {
      const name = typeof body.name === 'string' ? body.name.trim() : '';
      if (!name) return Response.json({ error: 'name is required' }, { status: 400 });
      roster.rename(id, name);
      break;
    }
    case 'suspend':
      roster.suspend(id, at);
      break;
    case 'revive':
      roster.revive(id, allowance);
      break;
    case 'expel':
      roster.expel(id, at);
      break;
    case 'readmit':
      roster.readmit(id, allowance);
      break;
    default:
      return Response.json({ error: 'unknown action' }, { status: 400 });
  }

  return Response.json({ student: roster.get(id) });
}
