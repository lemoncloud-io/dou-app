import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

import { build, type BuildOptions, type Plugin } from 'esbuild';
import { JSDOM, VirtualConsole, type DOMWindow } from 'jsdom';

/**
 * A page as the scenario runner and the host conversation test run it: its HTML without scripts, and
 * its scripts as classic code, in order. A window with no browser — jsdom — cannot run ES modules, so
 * each module script is bundled first into one self-contained script.
 */
export interface PageSource {
    html: string;
    scripts: string[];
}

/** An address of the kind a page is served from; the runner's window has it as its location. */
export const PAGE_URL = 'https://example.apps.chatic.io/';

/** What `import.meta.env` reads in a production build. */
const PRODUCTION_ENV = {
    'import.meta.env.DEV': 'false',
    'import.meta.env.PROD': 'true',
    'import.meta.env.MODE': '"production"',
    'import.meta.env.SSR': 'false',
    'import.meta.env.BASE_URL': '"/"',
};

const bundle = async (options: BuildOptions): Promise<string> => {
    const result = await build({
        bundle: true,
        write: false,
        format: 'iife',
        platform: 'browser',
        target: 'es2020',
        logLevel: 'silent',
        loader: { '.css': 'empty', '.svg': 'dataurl', '.png': 'dataurl', '.jpg': 'dataurl', '.webp': 'dataurl' },
        outdir: '/',
        ...options,
    });
    const js = result.outputFiles?.find(file => file.path.endsWith('.js'));
    if (!js) throw new Error('The page bundled to nothing.');
    return js.text;
};

const SCRIPT = /<script\b([^>]*)>([\s\S]*?)<\/script>/gi;
const attribute = (attributes: string, name: string) =>
    new RegExp(`(?:^|\\s)${name}\\s*=\\s*["']([^"']*)["']`, 'i').exec(attributes)?.[1];

/**
 * A built page, from its folder: `index.html` and the scripts it loads, each a classic script. A module
 * script and the chunks it imports become one; a script from another host is left out (the runner does
 * not reach the network).
 */
export const loadDist = async (dir: string): Promise<PageSource> => {
    const htmlPath = join(dir, 'index.html');
    if (!existsSync(htmlPath)) throw new Error(`${htmlPath} is missing: build the page first.`);
    const raw = readFileSync(htmlPath, 'utf8');
    const scripts: string[] = [];
    for (const match of raw.matchAll(SCRIPT)) {
        const [, attributes, inline] = match;
        const src = attribute(attributes, 'src');
        const module = attribute(attributes, 'type') === 'module';
        if (src && /^(?:[a-z]+:)?\/\//i.test(src)) continue;
        const path = src ? join(dir, src.replace(/^\//, '')) : null;
        if (!module) {
            scripts.push(path ? readFileSync(path, 'utf8') : inline);
            continue;
        }
        scripts.push(
            await bundle(
                path
                    ? { entryPoints: [path], absWorkingDir: dir }
                    : { stdin: { contents: inline, resolveDir: dir, loader: 'js' }, absWorkingDir: dir }
            )
        );
    }
    return { html: raw.replace(SCRIPT, '').replace(/<link\b[^>]*rel=["']modulepreload["'][^>]*>/gi, ''), scripts };
};

export interface EntryOptions {
    /** The page's HTML; its scripts are dropped, the entry stands in for them. */
    html: string;
    /** The module the page starts from, such as `src/main.ts`. */
    entry: string;
    /** Rewrites a source file as it is read: how a test makes a broken variant of a page. */
    transform?: (path: string, text: string) => string;
    /** Extra esbuild plugins. */
    plugins?: Plugin[];
}

/**
 * A page from its sources, bundled as a production build would be (`import.meta.env.DEV` false), for a
 * test that changes the source and runs it without a build. The nearest `tsconfig.json` resolves paths.
 */
export const loadEntry = async (options: EntryOptions): Promise<PageSource> => {
    const plugins: Plugin[] = [...(options.plugins ?? [])];
    const transform = options.transform;
    if (transform) {
        plugins.push({
            name: 'transform',
            setup: build =>
                build.onLoad({ filter: /\.[cm]?[jt]sx?$/ }, args => {
                    if (args.path.includes('node_modules')) return undefined;
                    const text = readFileSync(args.path, 'utf8');
                    const loader = /\.tsx?$/.test(args.path) ? (args.path.endsWith('x') ? 'tsx' : 'ts') : 'js';
                    return { contents: transform(args.path, text), loader };
                }),
        });
    }
    return {
        html: options.html.replace(SCRIPT, ''),
        scripts: [
            await bundle({
                entryPoints: [options.entry],
                absWorkingDir: dirname(options.entry),
                define: PRODUCTION_ENV,
                plugins,
            }),
        ],
    };
};

/** One module, bundled to run in the page before the page's own scripts — the runner's mock. */
export const bundleModule = (contents: string, resolveDir: string): Promise<string> =>
    bundle({ stdin: { contents, resolveDir, loader: 'ts' }, absWorkingDir: resolveDir, define: PRODUCTION_ENV });

export interface OpenedPage {
    window: DOMWindow;
    /** Errors the page threw, as the runner heard them. */
    errors: string[];
    close(): void;
}

export interface OpenOptions {
    /** Runs in the new window before the page's scripts: where the app, or its mock, is put in place. */
    beforeScripts?: (window: DOMWindow) => void;
    url?: string;
}

/**
 * Opens `source` in a new window with no browser behind it: scripts run, layout and painting do not.
 * Every error the page throws — synchronously, in an event, or as an unhandled rejection — is recorded.
 */
export const openPage = (source: PageSource, options: OpenOptions = {}): OpenedPage => {
    const errors: string[] = [];
    const virtualConsole = new VirtualConsole();
    virtualConsole.on('jsdomError', error => errors.push(`${error.message}`));
    const dom = new JSDOM(source.html, {
        url: options.url ?? PAGE_URL,
        runScripts: 'outside-only',
        pretendToBeVisual: true,
        virtualConsole,
    });
    const { window } = dom;
    // What a page cannot do in a window with no browser, made harmless rather than an error of its own.
    window.open = () => null;
    window.scrollTo = () => undefined;
    const onRejection = (reason: unknown) => errors.push(`Unhandled rejection: ${describe(reason)}`);
    process.on('unhandledRejection', onRejection);
    options.beforeScripts?.(window);
    for (const script of source.scripts) {
        try {
            window.eval(script);
        } catch (error) {
            errors.push(describe(error));
        }
    }
    return {
        window,
        errors,
        close: () => {
            process.off('unhandledRejection', onRejection);
            window.close();
        },
    };
};

const describe = (error: unknown): string => {
    if (error && typeof error === 'object' && 'message' in error) {
        const { name, message } = error as { name?: string; message?: string };
        return `${name ?? 'Error'}: ${message ?? ''}`;
    }
    return String(error);
};

/** Waits for the page's queued work: replies, timers of `ms`, and what they set off. */
export const settle = (ms = 30): Promise<void> => new Promise(resolve => setTimeout(resolve, ms));
