/**
 * What is actually running, right now (maker's "is it still alive?" check).
 *
 * Read from git at request time rather than baked in at build time, so the
 * answer describes the checkout the process is serving from — the whole point
 * is to notice when a deploy did not happen, and a value frozen into the bundle
 * would happily report a commit that is no longer the tip.
 *
 * `startedAt` is captured when this module first loads, which is the closest
 * honest reading of "when was this deployed": pm2 restarting the app is what a
 * deploy does here.
 */

const startedAt = Date.now();

export interface BuildInfo {
  sha: string;
  shortSha: string;
  subject: string;
  committedAt: number;
  /** True when the running checkout has uncommitted changes. */
  dirty: boolean;
  branch: string;
  /** When this server process started — a deploy restarts it. */
  startedAt: number;
  now: number;
}

async function git(args: string[]): Promise<string> {
  const proc = Bun.spawn(['git', ...args], {
    cwd: process.cwd(),
    stdout: 'pipe',
    stderr: 'ignore',
  });
  const out = await new Response(proc.stdout).text();
  await proc.exited;
  return out.trim();
}

export async function buildInfo(): Promise<BuildInfo> {
  const [line, status, branch] = await Promise.all([
    git(['log', '-1', '--format=%H%x00%s%x00%ct']),
    git(['status', '--porcelain']),
    git(['rev-parse', '--abbrev-ref', 'HEAD']),
  ]);
  const [sha = '', subject = '', committed = '0'] = line.split('\0');
  return {
    sha,
    shortSha: sha.slice(0, 7),
    subject,
    committedAt: Number(committed) * 1000,
    dirty: status.length > 0,
    branch,
    startedAt,
    now: Date.now(),
  };
}
