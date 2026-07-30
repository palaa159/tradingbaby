/**
 * Choosing what to work on from the request box (spec §9.4).
 *
 * The rule is oldest-first and once-each. Oldest-first because a student that
 * asked yesterday has been blocked since yesterday. Once-each because the
 * Principal cannot satisfy every request — one it hands to the maker stays open
 * on purpose, and without a memory of having tried, it would pick that same
 * request every round and pay for the same answer forever.
 */

export interface OpenRequest {
  id: string;
  studentId: string;
  studentName: string;
  title: string;
  body: string;
  at: number;
}

/**
 * The next request to work, or null when there is nothing new to do.
 * `attempted` is the set of request ids that already have a work-log entry.
 */
export function nextRequest(open: OpenRequest[], attempted: Set<string>): OpenRequest | null {
  const fresh = open.filter((request) => !attempted.has(request.id));
  if (fresh.length === 0) return null;
  return fresh.reduce((oldest, request) => (request.at < oldest.at ? request : oldest));
}
