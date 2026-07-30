/**
 * Reading `git status --porcelain` — the Designer's only way of knowing what it
 * just did, and the input to the zone check that decides whether the round is
 * kept or thrown away.
 *
 * It lives apart from designer.ts because that file runs a round on import.
 */

/**
 * The paths in porcelain output.
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
