import { describe, expect, test } from 'bun:test';

import { changedPaths } from './changed.ts';

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
