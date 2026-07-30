import { describe, expect, test } from 'bun:test';

import { pagesFor } from './audit.ts';

const PAGES = ['/a', '/b', '/c', '/d', '/e'];

describe('pagesFor', () => {
  test('takes a window of the size asked for', () => {
    expect(pagesFor(0, 2, PAGES)).toEqual(['/a', '/b']);
  });

  test('the window advances with the round', () => {
    expect(pagesFor(1, 2, PAGES)).toEqual(['/b', '/c']);
    expect(pagesFor(2, 2, PAGES)).toEqual(['/c', '/d']);
  });

  test('it wraps rather than running off the end', () => {
    expect(pagesFor(4, 3, PAGES)).toEqual(['/e', '/a', '/b']);
  });

  test('every page is seen within one lap', () => {
    const seen = new Set<string>();
    for (let round = 0; round < PAGES.length; round++) {
      for (const page of pagesFor(round, 2, PAGES)) seen.add(page);
    }
    expect([...seen].sort()).toEqual([...PAGES].sort());
  });

  test('a window as wide as the list is the whole list, once', () => {
    expect(pagesFor(3, 5, PAGES)).toEqual(PAGES);
    expect(pagesFor(3, 99, PAGES)).toEqual(PAGES);
  });

  test('the same round always audits the same pages', () => {
    expect(pagesFor(7, 3, PAGES)).toEqual(pagesFor(7, 3, PAGES));
  });
});
