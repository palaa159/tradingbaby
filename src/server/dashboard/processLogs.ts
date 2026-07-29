/**
 * The four background processes' stdout, readable from the screen.
 *
 * The maker's real question when something looks stalled is "what is the daemon
 * saying right now", and until now that meant ssh. This answers it.
 *
 * The file list is a fixed whitelist and the caller never supplies a path. The
 * dashboard is served unauthenticated on a public hostname, so a reader that
 * accepted a filename would be an arbitrary-file-read endpoint one traversal
 * away from /etc/shadow. Only these four names resolve to anything, and only
 * the tail is returned.
 */

const LOGS = {
  daemon: '/var/log/alpha-daemon.log',
  trader: '/var/log/alpha-trader.log',
  principal: '/var/log/alpha-principal.log',
  dashboard: '/var/log/alpha-dashboard.log',
} as const;

export type LogName = keyof typeof LOGS;

export const LOG_NAMES = Object.keys(LOGS) as LogName[];

export function isLogName(value: string): value is LogName {
  return Object.hasOwn(LOGS, value);
}

const MAX_BYTES = 64 * 1024;

export interface LogTail {
  name: LogName;
  lines: string[];
  bytes: number;
  truncated: boolean;
}

/** Last `lines` lines of one whitelisted log, capped so a huge file cannot hang the page. */
export async function tail(name: LogName, lines = 200): Promise<LogTail> {
  const file = Bun.file(LOGS[name]);
  if (!(await file.exists())) {
    return { name, lines: [], bytes: 0, truncated: false };
  }
  const size = file.size;
  const from = Math.max(0, size - MAX_BYTES);
  const text = await file.slice(from).text();
  const all = text.split('\n').filter((l) => l.length > 0);
  // A partial first line is an artefact of slicing mid-file, not a log line.
  const body = from > 0 ? all.slice(1) : all;
  return {
    name,
    lines: body.slice(-lines),
    bytes: size,
    truncated: from > 0,
  };
}

export async function tailAll(lines = 60): Promise<LogTail[]> {
  return Promise.all(LOG_NAMES.map((n) => tail(n, lines)));
}
