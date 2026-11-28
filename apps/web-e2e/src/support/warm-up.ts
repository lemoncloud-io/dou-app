import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';

import { chromium, type Browser, type Frame, type Page } from '@playwright/test';

import { E2E_BASE_URL } from './env';

const WEB_ROOT = path.resolve(__dirname, '../../../web');
const WEB_SRC = path.join(WEB_ROOT, 'src');
const SOURCE = /\.(ts|tsx)$/;
const SKIPPED = /\.(test|spec|stories)\.(ts|tsx)$/;
const DYNAMIC_IMPORT = /import\(\s*'(\.{1,2}\/[^']+)'\s*\)/g;
const RESOLVE_SUFFIXES = ['', '.ts', '.tsx', '/index.ts', '/index.tsx'];
const ATTEMPTS = 5;

const sourceFiles = (dir: string): string[] =>
    readdirSync(dir).flatMap(name => {
        const file = path.join(dir, name);
        if (statSync(file).isDirectory()) return sourceFiles(file);
        return SOURCE.test(name) && !SKIPPED.test(name) ? [file] : [];
    });

const resolveSource = (from: string, specifier: string): string | undefined =>
    RESOLVE_SUFFIXES.map(suffix => path.resolve(path.dirname(from), specifier) + suffix).find(
        candidate => existsSync(candidate) && statSync(candidate).isFile()
    );

export const lazyModuleUrls = (): string[] => {
    const urls = new Set<string>();
    for (const file of sourceFiles(WEB_SRC)) {
        for (const [, specifier] of readFileSync(file, 'utf8').matchAll(DYNAMIC_IMPORT)) {
            const target = resolveSource(file, specifier as string);
            if (target) urls.add('/' + path.relative(WEB_ROOT, target).split(path.sep).join('/'));
        }
    }
    return [...urls].sort();
};

const importAll = async (urls: string[]): Promise<string[]> => {
    const results = await Promise.allSettled(urls.map(url => import(url)));
    return urls.filter((_, index) => results[index]?.status === 'rejected');
};

const openBrowser = (): Promise<Browser> => {
    const server = process.env['WEB_E2E_BROWSER_SERVER'];
    return server ? chromium.connect(server, { exposeNetwork: '<loopback>' }) : chromium.launch();
};

const warmPass = async (page: Page, urls: string[]): Promise<boolean> => {
    await page.goto(E2E_BASE_URL, { waitUntil: 'load' });
    let navigations = 0;
    const count = (frame: Frame) => {
        if (frame === page.mainFrame()) navigations += 1;
    };
    page.on('framenavigated', count);
    try {
        const failed = await page.evaluate(importAll, urls);
        await page.waitForLoadState('networkidle');
        if (failed.length > 0)
            {console.warn(`warm-up: ${failed.length} lazy modules failed to load: ${failed.join(', ')}`);}
        return navigations === 0;
    } finally {
        page.off('framenavigated', count);
    }
};

export default async function warmUp(): Promise<void> {
    const urls = lazyModuleUrls();
    const browser = await openBrowser();
    let lastError: unknown = 'the page reloaded on every pass';
    try {
        const page = await browser.newPage();
        for (let attempt = 1; attempt <= ATTEMPTS; attempt += 1) {
            try {
                if (await warmPass(page, urls)) return;
            } catch (error) {
                lastError = error;
            }
        }
    } finally {
        await browser.close();
    }
    throw new Error(`warm-up: the dev server did not settle after ${ATTEMPTS} passes: ${String(lastError)}`);
}
