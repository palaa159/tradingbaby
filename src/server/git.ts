/**
 * The git the unattended agents are allowed to use.
 *
 * The Designer and the Principal both edit the repo with nobody watching, and
 * both need the same four things: run a command, read what changed, put it all
 * back, or hand the work over. Keeping that in one place means the rules about
 * what they may do to the repository are written once — and `main` never being
 * one of them is the important rule.
 *
 * Nothing here merges, force-pushes, or writes to an existing branch. A round's
 * work lands on a branch of its own, and the maker decides the rest.
 */

export interface Shell {
  ok: boolean;
  out: string;
}

/** Run a command in the repo, capturing both streams. Never throws. */
export async function sh(cmd: string[]): Promise<Shell> {
  const proc = Bun.spawn(cmd, { cwd: process.cwd(), stdout: 'pipe', stderr: 'pipe' });
  const [out, err] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
  ]);
  return { ok: (await proc.exited) === 0, out: (out + err).slice(-4000) };
}

/**
 * The paths in `git status --porcelain` output.
 *
 * Lines are `XY path`, and a modified-but-unstaged file leads with a space.
 * Trimming the whole blob before splitting ate that space on the first line, so
 * cutting three characters then ate the first letter of the path: the round that
 * exposed this reported `rc/components/ui/slider.tsx`, could not place it in any
 * zone, and reverted every change it had just made. Split first, cut per line.
 */
export function changedPaths(porcelain: string): string[] {
  return porcelain
    .split('\n')
    .filter((line) => line.length > 3)
    // A rename arrives as `old -> new`; the new name is the one that was written.
    .map((line) => (line.slice(3).split(' -> ').pop() ?? '').trim())
    .filter(Boolean);
}

/** Put the tree back exactly as it was found. */
export async function revertTree(): Promise<void> {
  await sh(['git', 'checkout', '--', '.']);
  await sh(['git', 'clean', '-fd', 'src']);
}

/** `designer/2026-07-30-03-15-20` — UTC, so two boxes could never disagree. */
export function branchName(prefix: string, at: number): string {
  const stamp = new Date(at).toISOString().replace('T', '-').replace(/[:.]/g, '-').slice(0, 19);
  return `${prefix}/${stamp}`;
}

export interface HandoffRequest {
  /** `designer` or `principal` — the first half of the branch name. */
  prefix: string;
  /** Commit subject. One line, no trailing period. */
  subject: string;
  /** Commit body: what the agent did and why, in its own words. */
  body: string;
  /** Exactly the files the zone check approved. Nothing else is staged. */
  paths: string[];
  at: number;
}

export type Handoff =
  | { ok: true; branch: string; pushed: boolean; note: string }
  | { ok: false; error: string };

/**
 * Move a finished round onto a branch of its own and step back off it.
 *
 * The agents used to leave their work uncommitted, which was safe and also a
 * dead end: each one skips any round that starts on a dirty tree, so the first
 * change either of them kept stopped both of them until the maker came back and
 * committed it by hand. Now the work goes somewhere it can wait, `main` is left
 * exactly as it was, and the tree is clean for the next round.
 *
 * The branch is pushed when there is a remote that takes it, because the whole
 * point is that the maker can look at this from a phone. A push that fails is
 * not a failed round — the commit exists either way, and the note says so.
 */
export async function handOff(request: HandoffRequest): Promise<Handoff> {
  const from = (await sh(['git', 'rev-parse', '--abbrev-ref', 'HEAD'])).out.trim();
  if (!from || from === 'HEAD') {
    return { ok: false, error: `อยู่บน branch ที่กลับไม่ได้ (${from || 'ไม่ทราบ'})` };
  }

  const branch = branchName(request.prefix, request.at);
  const created = await sh(['git', 'checkout', '-b', branch]);
  if (!created.ok) return { ok: false, error: `สร้าง branch ${branch} ไม่ได้: ${created.out}` };

  // Stage the approved paths and nothing else: `git add -A` would sweep up any
  // stray file that happened to be sitting in the tree.
  const staged = await sh(['git', 'add', '--', ...request.paths]);
  const committed = staged.ok
    ? await sh(['git', 'commit', '-m', request.subject, '-m', request.body])
    : staged;

  if (!committed.ok) {
    // Get off the branch before unwinding, or the revert cleans the wrong tree.
    await sh(['git', 'checkout', from]);
    await sh(['git', 'branch', '-D', branch]);
    await revertTree();
    return { ok: false, error: `commit ไม่สำเร็จ: ${committed.out}` };
  }

  const pushed = await sh(['git', 'push', '-u', 'origin', branch]);

  const back = await sh(['git', 'checkout', from]);
  if (!back.ok) {
    // The commit is safe on the branch; the process is just standing in the
    // wrong place, and every later round would start from there.
    return { ok: false, error: `commit แล้วบน ${branch} แต่กลับไป ${from} ไม่ได้: ${back.out}` };
  }

  return {
    ok: true,
    branch,
    pushed: pushed.ok,
    note: pushed.ok
      ? `commit ขึ้น branch ${branch} และ push แล้ว — ${from} ไม่ถูกแตะ`
      : `commit ขึ้น branch ${branch} แล้ว (push ไม่ผ่าน: ${pushed.out.slice(-200)}) — ${from} ไม่ถูกแตะ`,
  };
}
