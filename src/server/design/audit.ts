/**
 * Evidence for the Maker Designer, gathered before any opinion is formed.
 *
 * Everything here is measured rather than judged: overflow in pixels, tap
 * targets in pixels, what is actually scrollable, what the console said. The
 * judgement happens later, with a model looking at the screenshots — but it has
 * to argue from these numbers, so "this feels cramped" must become "this button
 * is 24px tall on a 390px screen" before it counts as a finding.
 */

import { chromium, type Browser, type Page } from 'playwright-core';

export const CHROMIUM =
  process.env.DESIGNER_CHROMIUM ?? '/root/.cache/ms-playwright/chromium-1217/chrome-linux64/chrome';

/** Phone first, because that is how the maker actually looks at this. */
export const VIEWPORTS = [
  { name: 'mobile', width: 390, height: 664, isMobile: true },
  { name: 'desktop', width: 1440, height: 900, isMobile: false },
] as const;

export interface ElementNote {
  tag: string;
  label: string;
  width: number;
  height: number;
}

export interface PageAudit {
  path: string;
  viewport: string;
  screenshot: string;
  overflowPx: number;
  textLength: number;
  interactiveCount: number;
  smallTargets: ElementNote[];
  scrollables: { selector: string; scrollHeight: number; clientHeight: number }[];
  consoleErrors: string[];
  longestParagraph: number;
  headings: string[];
}

const METRICS = `(() => {
  const vis = (el) => {
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0;
  };
  const interactive = Array.from(document.querySelectorAll('a,button,input,select,[role="button"]')).filter(vis);
  const small = interactive
    .map((el) => {
      const r = el.getBoundingClientRect();
      return {
        tag: el.tagName.toLowerCase(),
        label: (el.getAttribute('aria-label') || el.textContent || '').trim().slice(0, 40),
        width: Math.round(r.width),
        height: Math.round(r.height),
      };
    })
    .filter((e) => e.height < 36 || e.width < 36);
  const scrollables = Array.from(document.querySelectorAll('*'))
    .filter((el) => el.scrollHeight > el.clientHeight + 8 && el.clientHeight > 80)
    .slice(0, 8)
    .map((el) => ({
      selector: el.tagName.toLowerCase() + (typeof el.className === 'string' && el.className ? '.' + el.className.split(' ').filter(Boolean).slice(0, 2).join('.') : ''),
      scrollHeight: el.scrollHeight,
      clientHeight: el.clientHeight,
    }));
  const paragraphs = Array.from(document.querySelectorAll('p,pre,td,div')).map((el) => (el.textContent || '').trim().length);
  return {
    overflowPx: document.documentElement.scrollWidth - document.documentElement.clientWidth,
    textLength: (document.body.innerText || '').trim().length,
    interactiveCount: interactive.length,
    smallTargets: small,
    scrollables,
    longestParagraph: paragraphs.length ? Math.max.apply(null, paragraphs) : 0,
    headings: Array.from(document.querySelectorAll('h1,h2,h3,h4')).map((h) => (h.textContent || '').trim()).slice(0, 12),
  };
})()`;

async function auditPage(
  page: Page,
  base: string,
  path: string,
  viewport: string,
  shotDir: string,
): Promise<PageAudit> {
  const errors: string[] = [];
  const note = (m: string) => {
    if (!m.includes('404')) errors.push(m.slice(0, 200));
  };
  page.on('pageerror', (e) => note(e.message));
  page.on('console', (m) => {
    if (m.type() === 'error') note(m.text());
  });

  await page.goto(base + path, { waitUntil: 'networkidle', timeout: 45_000 });
  // Give the 3s poll one chance to paint real data rather than a loading line.
  await page.waitForTimeout(3_500);

  const slug = path.replace(/[^a-z0-9]/gi, '_') || 'root';
  const screenshot = `${shotDir}/${viewport}${slug}.png`;
  await page.screenshot({ path: screenshot });

  const metrics = (await page.evaluate(METRICS)) as
    | Omit<PageAudit, 'path' | 'viewport' | 'screenshot' | 'consoleErrors'>
    | undefined;
  if (!metrics || !Array.isArray(metrics.smallTargets)) {
    throw new Error(`วัดหน้า ${path} (${viewport}) ไม่ได้ — evaluate ไม่คืนค่า`);
  }
  return { ...metrics, path, viewport, screenshot, consoleErrors: errors };
}

export interface AuditOptions {
  base: string;
  paths: string[];
  shotDir: string;
  student?: string | undefined;
}

/**
 * The slice of pages one round looks at.
 *
 * Every page at both viewports was eighteen screenshots, and a critique of
 * eighteen images is a job the model did not finish — three rounds running sat
 * past twenty minutes and were killed before the gates. A window that advances
 * by round number covers the whole screen across a morning while keeping any
 * one round small enough to end. Driven by the round count rather than a clock
 * or a random pick, so the same round number always audits the same pages.
 */
export function pagesFor(round: number, perRound: number, pages: string[]): string[] {
  if (perRound >= pages.length) return [...pages];
  const start = ((round % pages.length) + pages.length) % pages.length;
  return Array.from({ length: perRound }, (_, i) => pages[(start + i) % pages.length] as string);
}

/** One full sweep: every page, both viewports. */
export async function runAudit(opts: AuditOptions): Promise<PageAudit[]> {
  const browser: Browser = await chromium.launch({
    executablePath: CHROMIUM,
    args: ['--no-sandbox', '--ignore-certificate-errors'],
  });
  const results: PageAudit[] = [];
  try {
    for (const vp of VIEWPORTS) {
      const ctx = await browser.newContext({
        viewport: { width: vp.width, height: vp.height },
        isMobile: vp.isMobile,
        hasTouch: vp.isMobile,
        ignoreHTTPSErrors: true,
      });
      const page = await ctx.newPage();
      for (const path of opts.paths) {
        const url = opts.student ? `${path}?student=${encodeURIComponent(opts.student)}` : path;
        results.push(await auditPage(page, opts.base, url, vp.name, opts.shotDir));
      }
      await ctx.close();
    }
  } finally {
    await browser.close();
  }
  return results;
}

/** Machine-checkable problems. The model is asked about everything else. */
export function hardFlags(audits: PageAudit[]): string[] {
  const flags: string[] = [];
  for (const a of audits) {
    if (a.overflowPx > 2) {
      flags.push(`${a.viewport} ${a.path}: หน้าเลื่อนออกด้านข้าง ${a.overflowPx}px`);
    }
    if (a.textLength < 20) {
      flags.push(`${a.viewport} ${a.path}: หน้าแทบว่างเปล่า (${a.textLength} ตัวอักษร)`);
    }
    for (const t of a.smallTargets) {
      flags.push(
        `${a.viewport} ${a.path}: ปุ่ม/ลิงก์ "${t.label}" เล็กเกินนิ้ว (${t.width}x${t.height}px)`,
      );
    }
    for (const e of a.consoleErrors) {
      flags.push(`${a.viewport} ${a.path}: console error — ${e}`);
    }
  }
  return flags;
}
