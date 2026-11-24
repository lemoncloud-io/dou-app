import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const APP = join(__dirname, '../../..');
const SCREEN = join(__dirname, 'pages/shellCheckout');

const sources = (dir: string): string[] =>
    readdirSync(dir).flatMap(name => {
        const path = join(dir, name);
        if (statSync(path).isDirectory()) return sources(path);
        return /\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name) ? [path] : [];
    });

describe('the shell checkout screen stays out of a production build', () => {
    it('is the only place that takes values from the payment library', () => {
        const outside = sources(APP)
            .filter(file => !file.startsWith(SCREEN))
            .filter(file => /^import (?!type)[^;]*from '@chatic\/web-checkout/m.test(readFileSync(file, 'utf8')))
            .map(file => relative(APP, file));
        expect(outside).toEqual([]);
    });

    it('is loaded only behind the dev or local build check', () => {
        const routes = readFileSync(join(__dirname, 'routes/index.tsx'), 'utf8');
        expect(routes).toMatch(
            /import\.meta\.env\.VITE_ENV === 'DEV' \|\| import\.meta\.env\.VITE_ENV === 'LOCAL'\s*\?\s*lazy\(\(\) =>\s*import\('\.\.\/pages\/shellCheckout\/ShellCheckoutPage'\)/
        );
        expect(routes).not.toMatch(/^import [^;]*pages\/shellCheckout/m);
    });
});
