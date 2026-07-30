import { describe, expect, test } from 'bun:test';

import { nextRequest, type OpenRequest } from './requests.ts';

function request(id: string, at: number): OpenRequest {
  return { id, studentId: 'mali-2026', studentName: 'มะลิ', title: id, body: '', at };
}

describe('nextRequest', () => {
  test('an empty box is nothing to do', () => {
    expect(nextRequest([], new Set())).toBeNull();
  });

  test('takes the one that has been waiting longest', () => {
    const picked = nextRequest([request('b', 200), request('a', 100), request('c', 300)], new Set());
    expect(picked?.id).toBe('a');
  });

  test('skips what it has already tried', () => {
    const picked = nextRequest([request('a', 100), request('b', 200)], new Set(['a']));
    expect(picked?.id).toBe('b');
  });

  test('a box of only-tried requests is nothing to do', () => {
    // The loop this prevents: a request the Principal handed to the maker stays
    // open, and would otherwise be picked again on every single round.
    expect(nextRequest([request('a', 100)], new Set(['a']))).toBeNull();
  });
});
