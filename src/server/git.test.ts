import { describe, expect, test } from 'bun:test';

import { branchName, changedPaths } from './git.ts';

describe('branchName', () => {
  test('one branch per round, named for when the round happened', () => {
    expect(branchName('designer', Date.UTC(2026, 6, 30, 3, 15, 20))).toBe(
      'designer/2026-07-30-03-15-20',
    );
  });

  test('two rounds a second apart never collide', () => {
    const at = Date.UTC(2026, 6, 30, 3, 15, 20);
    expect(branchName('principal', at)).not.toBe(branchName('principal', at + 1000));
  });
});

describe('changedPaths', () => {
  test('keeps the first letter of a modified path', () => {
    // The regression: this line leads with a space, and the old parser trimmed
    // the blob before cutting, turning src/ into rc/ and reverting the round.
    expect(changedPaths(' M src/components/ui/slider.tsx\n')).toEqual([
      'src/components/ui/slider.tsx',
    ]);
  });

  test('reads staged, unstaged and untracked lines together', () => {
    const porcelain = ' M src/app/page.tsx\nM  src/app/brain/page.tsx\n?? src/app/new/page.tsx\n';
    expect(changedPaths(porcelain)).toEqual([
      'src/app/page.tsx',
      'src/app/brain/page.tsx',
      'src/app/new/page.tsx',
    ]);
  });

  test('takes the destination of a rename', () => {
    expect(changedPaths('R  src/app/old.tsx -> src/app/new.tsx\n')).toEqual(['src/app/new.tsx']);
  });

  test('a clean tree changes nothing', () => {
    expect(changedPaths('')).toEqual([]);
    expect(changedPaths('\n')).toEqual([]);
  });
});
