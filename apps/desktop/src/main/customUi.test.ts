import { join, sep } from 'node:path';

import { bundleRootFor, hashUrl, resolveEntryPath, zipDownloadPath } from './customUi';
import { CUSTOM_UI_ORIGIN } from './webUrl';

const ROOT = join(sep, 'tmp', 'custom-web', 'abc123');
const BASE = join(sep, 'tmp', 'custom-web');
const req = (path: string): string => `${CUSTOM_UI_ORIGIN}${path}`;

describe('hashUrl', () => {
    it('is deterministic for the same URL', () => {
        expect(hashUrl('https://cdn.example.com/bundle.zip')).toBe(hashUrl('https://cdn.example.com/bundle.zip'));
    });

    it('separates different URLs, including ones differing only by host', () => {
        expect(hashUrl('https://a.example.com/x.zip')).not.toBe(hashUrl('https://b.example.com/y.zip'));
        expect(hashUrl('https://a.example.com/x.zip')).not.toBe(hashUrl('https://b.example.com/x.zip'));
    });

    it('never yields a negative or sign-prefixed value (it becomes a directory name)', () => {
        for (const url of ['https://x.io/a.zip', 'https://y.io/' + 'z'.repeat(500), '']) {
            expect(hashUrl(url)).toMatch(/^[0-9a-f]+$/);
        }
    });
});

describe('bundleRootFor', () => {
    it('gives each zip URL its own extraction root under the base dir', () => {
        const a = bundleRootFor(BASE, 'https://cdn.example.com/a.zip');
        const b = bundleRootFor(BASE, 'https://cdn.example.com/b.zip');
        expect(a).not.toBe(b);
        expect(a.startsWith(join(BASE, 'webroot') + sep)).toBe(true);
    });

    it('is stable across calls, so a re-apply reuses the same root', () => {
        expect(bundleRootFor(BASE, 'https://cdn.example.com/a.zip')).toBe(
            bundleRootFor(BASE, 'https://cdn.example.com/a.zip')
        );
    });
});

describe('zipDownloadPath', () => {
    it('keeps the download beside the roots, not inside one', () => {
        const path = zipDownloadPath(BASE);
        expect(path).toBe(join(BASE, 'bundle.zip'));
        expect(path.startsWith(join(BASE, 'webroot'))).toBe(false);
    });
});

describe('resolveEntryPath', () => {
    it('maps the bundle root to index.html', () => {
        expect(resolveEntryPath(ROOT, req('/'))).toBe(join(ROOT, 'index.html'));
    });

    it('maps a nested asset to its file inside the root', () => {
        expect(resolveEntryPath(ROOT, req('/assets/app-1a2b.js'))).toBe(join(ROOT, 'assets', 'app-1a2b.js'));
    });

    it('ignores the query string and hash a bundler appends', () => {
        expect(resolveEntryPath(ROOT, req('/assets/app.js?v=3'))).toBe(join(ROOT, 'assets', 'app.js'));
        expect(resolveEntryPath(ROOT, req('/index.html#/chat/1'))).toBe(join(ROOT, 'index.html'));
    });

    it('decodes percent-encoded names so spaced filenames resolve', () => {
        expect(resolveEntryPath(ROOT, req('/my%20logo.png'))).toBe(join(ROOT, 'my logo.png'));
    });

    it('confines traversal to the root — dot segments cannot climb out', () => {
        // URL parsing resolves dot segments before this function sees them, encoded or not
        // (`/%2e%2e/%2e%2e/etc/passwd` arrives as pathname `/etc/passwd`), so a traversal
        // entry lands inside the root rather than above it. Asserted as the observable
        // outcome, since that is the property that matters — not which layer enforces it.
        expect(resolveEntryPath(ROOT, req('/%2e%2e/%2e%2e/etc/passwd'))).toBe(join(ROOT, 'etc', 'passwd'));
        expect(resolveEntryPath(ROOT, req('/assets/%2e%2e/%2e%2e/%2e%2e/secret'))).toBe(join(ROOT, 'secret'));
        expect(resolveEntryPath(ROOT, req('/../..'))).toBe(join(ROOT, 'index.html'));
    });

    it('does not let a sibling that shares the root prefix be reached', () => {
        // `/tmp/custom-web/abc123-evil` starts with the root string but is not inside it;
        // it must resolve under the root, never beside it.
        expect(resolveEntryPath(ROOT, req('/%2e%2e/abc123-evil/index.html'))).toBe(
            join(ROOT, 'abc123-evil', 'index.html')
        );
    });

    it('treats a leading double slash as a relative path, not an absolute one', () => {
        expect(resolveEntryPath(ROOT, req('//etc/passwd'))).toBe(join(ROOT, 'etc', 'passwd'));
    });

    it('refuses a NUL byte, which path APIs reject at the OS boundary', () => {
        expect(resolveEntryPath(ROOT, req('/app%00.js'))).toBeNull();
    });

    it('refuses malformed percent-encoding and unparseable requests', () => {
        expect(resolveEntryPath(ROOT, req('/%E0%A4%A'))).toBeNull();
        expect(resolveEntryPath(ROOT, 'not a url')).toBeNull();
    });
});
