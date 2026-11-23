import { readFileSync, readdirSync } from 'node:fs';
import { extname, join } from 'node:path';

const SRC_ROOT = join(__dirname, '../../..');

const ALLOWED = ['features/auth/hooks/useNavigateToLogin.ts', 'routes/paths.ts'];

const LOGIN_ROUTE_PATTERN = /ROUTES\.mypage(\.login\b|\['login'\]|\["login"\])|['"`]\/mypage\/login['"`]/;

const sourceFiles = (dir: string): string[] =>
    readdirSync(dir, { withFileTypes: true }).flatMap(entry => {
        const full = join(dir, entry.name);
        if (entry.isDirectory()) return sourceFiles(full);
        if (!['.ts', '.tsx'].includes(extname(entry.name))) return [];
        if (entry.name.includes('.test.')) return [];
        return [full];
    });

const findDirectLoginNavigations = () =>
    sourceFiles(SRC_ROOT)
        .filter(file => !ALLOWED.some(allowed => file.endsWith(allowed)))
        .filter(file => LOGIN_ROUTE_PATTERN.test(readFileSync(file, 'utf-8')))
        .map(file => file.slice(SRC_ROOT.length + 1));

describe('로그인 진입점', () => {
    it('로그인 라우트를 직접 부르는 화면이 없다 (전부 useNavigateToLogin을 통과한다)', () => {
        expect(findDirectLoginNavigations()).toEqual([]);
    });

    it('matches the login route in every spelling, and not a route that only starts with its name', () => {
        const caught = [
            'navigate(ROUTES.mypage.login)',
            "navigate(ROUTES.mypage['login'])",
            "navigate('/mypage/login')",
        ];

        expect(caught.filter(source => !LOGIN_ROUTE_PATTERN.test(source))).toEqual([]);
        expect(LOGIN_ROUTE_PATTERN.test('navigate(ROUTES.mypage.loginEmail)')).toBe(false);
    });

    it('알려진 진입점이 모두 훅을 쓴다', () => {
        const entryPoints = [
            'features/mypage/pages/MyPage.tsx',
            'features/auth/components/PhoneVerifyBanner.tsx',
            'features/subscription/pages/SubscriptionPlansPage.tsx',
        ];

        for (const entry of entryPoints) {
            const source = readFileSync(join(SRC_ROOT, entry), 'utf-8');
            expect({ entry, callsHook: source.includes('useNavigateToLogin()') }).toEqual({
                entry,
                callsHook: true,
            });
        }
    });
});
