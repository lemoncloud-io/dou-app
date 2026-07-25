import { join, sep } from 'node:path';

import { resolveEntryPath } from './customUi';
import { CUSTOM_UI_ORIGIN } from './webUrl';

const ROOT = join(sep, 'tmp', 'custom-web', 'abc123');
const req = (path: string): string => `${CUSTOM_UI_ORIGIN}${path}`;

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
