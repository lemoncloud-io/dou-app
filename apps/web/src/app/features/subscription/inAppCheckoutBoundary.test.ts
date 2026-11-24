import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const APP = join(__dirname, '../../..');
const SCREEN = join(__dirname, 'pages/inAppCheckout');

const sources = (dir: string): string[] =>
    readdirSync(dir).flatMap(name => {
        const path = join(dir, name);
        if (statSync(path).isDirectory()) return sources(path);
        return /\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name) ? [path] : [];
    });

describe('the in-app checkout stays in its own lazy chunk', () => {
    it('is the only place that takes values from the payment library', () => {
        const outside = sources(APP)
            .filter(file => !file.startsWith(SCREEN))
            .filter(file => /^import (?!type)[^;]*from '@chatic\/web-checkout/m.test(readFileSync(file, 'utf8')))
            .map(file => relative(APP, file));
        expect(outside).toEqual([]);
    });

    it('is reached by no static import, only the route lazy-loads it', () => {
        const reaching = sources(APP)
            .filter(file => !file.startsWith(SCREEN))
            .filter(file => /^import [^;]*pages\/inAppCheckout/m.test(readFileSync(file, 'utf8')))
            .map(file => relative(APP, file));
        expect(reaching).toEqual([]);
    });
});
