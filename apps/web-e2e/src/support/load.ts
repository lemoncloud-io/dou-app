import type { Locator, Page } from '@playwright/test';

export const msUntilVisible = async (locator: Locator, timeout = 30_000): Promise<number> => {
    const started = performance.now();
    await locator.waitFor({ state: 'visible', timeout });
    return performance.now() - started;
};

export const msOf = async (step: () => Promise<unknown>): Promise<number> => {
    const started = performance.now();
    await step();
    return performance.now() - started;
};

export const heapMB = async (page: Page): Promise<number | null> => {
    if (page.context().browser()?.browserType().name() !== 'chromium') return null;
    const cdp = await page.context().newCDPSession(page);
    try {
        await cdp.send('HeapProfiler.collectGarbage');
        await cdp.send('Performance.enable');
        const { metrics } = await cdp.send('Performance.getMetrics');
        const used = metrics.find(metric => metric.name === 'JSHeapUsedSize')?.value;
        return used === undefined ? null : used / 1024 / 1024;
    } finally {
        await cdp.detach();
    }
};

export const HEAP_NOTE = 'WebKit does not expose heap size to Playwright';

export const isInViewport = async (target: Locator): Promise<boolean> => {
    if ((await target.count()) === 0) return false;
    return target.first().evaluate(el => {
        const box = el.getBoundingClientRect();
        return box.height > 0 && box.bottom > 0 && box.top < window.innerHeight;
    });
};

export const scrollUntilVisible = async (page: Page, target: Locator, maxSteps = 400): Promise<number> => {
    for (let step = 0; step < maxSteps; step += 1) {
        if (await isInViewport(target)) return step;
        await page.evaluate(() => {
            const scrollers = Array.from(document.querySelectorAll<HTMLElement>('*')).filter(
                el => el.scrollHeight > el.clientHeight + 4 && /(auto|scroll)/.test(getComputedStyle(el).overflowY)
            );
            const list = scrollers.sort((a, b) => b.scrollHeight - a.scrollHeight)[0];
            if (!list) return;
            list.scrollTop += list.clientHeight;
            list.dispatchEvent(new Event('scroll'));
        });
        await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => resolve(null))));
    }
    throw new Error(`scrollUntilVisible: not in the viewport after ${maxSteps} screens`);
};

export const requestsDuring = async (
    page: Page,
    sent: () => { type: string }[],
    window: number
): Promise<Record<string, number>> => {
    const before = sent().length;
    await page.waitForTimeout(window);
    const counts: Record<string, number> = {};
    for (const frame of sent().slice(before)) counts[frame.type] = (counts[frame.type] ?? 0) + 1;
    return counts;
};
