import { readFileSync, readdirSync } from 'node:fs';
import { extname, join } from 'node:path';

/**
 * Every screen that sends a user to login must go through `useNavigateToLogin`.
 *
 * The hook is what attaches `returnTo`, and the fallback when it is missing is home — which is
 * exactly what the old behaviour was. So an entry point that navigates to the login route by hand
 * does not break: it silently drops the user on home, and nobody notices until someone reports
 * that their subscription flow got cut short (ADR-0055).
 *
 * Asserted over the source tree rather than per screen so a NEW entry point is covered the day it
 * is written, without anyone remembering to add a case here. The known ones are listed below
 * only so a reviewer can see the expected shape of the list.
 *
 * If this fails: use `useNavigateToLogin()` instead of `navigate(ROUTES.mypage.login)`.
 */
const SRC_ROOT = join(__dirname, '../../..');

/** Only the hook that owns this navigation, and the path table that defines it, may name it. */
const ALLOWED = ['features/auth/hooks/useNavigateToLogin.ts', 'routes/paths.ts'];

/**
 * Both spellings. Matching only `ROUTES.mypage.login` would miss the raw literal — which already
 * exists in-tree (routes/paths.ts defines it), so it is one copy-paste away from a call site.
 */
const LOGIN_ROUTE_PATTERN = /ROUTES\.mypage(\.login|\['login'\]|\["login"\])|['"`]\/mypage\/login['"`]/;

const sourceFiles = (dir: string): string[] =>
    readdirSync(dir, { withFileTypes: true }).flatMap(entry => {
        const full = join(dir, entry.name);
        if (entry.isDirectory()) return sourceFiles(full);
        if (!['.ts', '.tsx'].includes(extname(entry.name))) return [];
        if (entry.name.includes('.test.')) return [];
        return [full];
    });

/** `ROUTES.mypage.login` written anywhere other than a `useNavigateToLogin` call. */
const findDirectLoginNavigations = () =>
    sourceFiles(SRC_ROOT)
        .filter(file => !ALLOWED.some(allowed => file.endsWith(allowed)))
        .filter(file => LOGIN_ROUTE_PATTERN.test(readFileSync(file, 'utf-8')))
        .map(file => file.slice(SRC_ROOT.length + 1));

describe('로그인 진입점', () => {
    it('로그인 라우트를 직접 부르는 화면이 없다 (전부 useNavigateToLogin을 통과한다)', () => {
        expect(findDirectLoginNavigations()).toEqual([]);
    });

    it('알려진 진입점이 모두 훅을 쓴다', () => {
        const entryPoints = [
            'features/mypage/pages/MyPage.tsx',
            'features/auth/components/PhoneVerifyBanner.tsx',
            // The subscription status screen deliberately is NOT one: it routes to the plans
            // screen, which is where a guest is asked before being sent to login.
            'features/subscription/pages/SubscriptionPlansPage.tsx',
        ];

        for (const entry of entryPoints) {
            // readFileSync throws ENOENT on a wrong SRC_ROOT, which is what anchors the scan above.
            const source = readFileSync(join(SRC_ROOT, entry), 'utf-8');
            expect({ entry, callsHook: source.includes('useNavigateToLogin()') }).toEqual({
                entry,
                callsHook: true,
            });
        }
    });
});
