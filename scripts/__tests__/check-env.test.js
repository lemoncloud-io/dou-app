const fs = require('fs');
const os = require('os');
const path = require('path');

const { checkStage, describeDefault, parseEnv, readTree, report } = require('../check-env');
const { APPS, BACKEND_KEYS } = require('../env-keys');

// A small table of its own, so the cases read without the real one's key lists.
const TABLE = {
    web: { group: 'web', carries: ['VITE_ENV', 'VITE_DOU_ENDPOINT', 'VITE_WS_ENDPOINT'] },
    landing: { group: 'web', carries: ['VITE_ENV', 'VITE_DOU_ENDPOINT'] },
    admin: { group: 'admin', carries: ['VITE_ENV', 'VITE_DOU_ENDPOINT'] },
};
const dev = { VITE_ENV: 'DEV', VITE_DOU_ENDPOINT: 'https://dou.dev.test', VITE_WS_ENDPOINT: 'wss://ws.dev.test' };

describe('parseEnv', () => {
    it('reads KEY=value lines and drops comments, blank lines and surrounding quotes', () => {
        const text = '# a comment\n\nVITE_ENV=DEV\nexport VITE_A="quoted"\nVITE_B=\'single\'\nVITE_C=\n';
        expect(parseEnv(text)).toEqual({ VITE_ENV: 'DEV', VITE_A: 'quoted', VITE_B: 'single', VITE_C: '' });
    });

    it('keeps an equals sign inside a value', () => {
        expect(parseEnv('VITE_URL=https://x.test/?a=1&b=2')).toEqual({ VITE_URL: 'https://x.test/?a=1&b=2' });
    });
});

describe('checkStage', () => {
    it('passes apps of one group that agree', () => {
        expect(
            checkStage(
                'dev',
                { web: dev, landing: { VITE_ENV: 'DEV', VITE_DOU_ENDPOINT: dev.VITE_DOU_ENDPOINT } },
                TABLE
            )
        ).toEqual([]);
    });

    it('reports a carried key that is missing or empty', () => {
        expect(checkStage('dev', { web: { VITE_ENV: 'DEV', VITE_DOU_ENDPOINT: '' } }, TABLE)).toEqual([
            'web: VITE_DOU_ENDPOINT, VITE_WS_ENDPOINT not set',
        ]);
    });

    it('reports a VITE_ENV that is not the file stage', () => {
        expect(checkStage('prod', { landing: { VITE_ENV: 'DEV', VITE_DOU_ENDPOINT: 'x' } }, TABLE)).toEqual([
            'landing: VITE_ENV is not PROD',
        ]);
    });

    it('takes any VITE_ENV in a stage with no fixed value', () => {
        expect(checkStage('localhost', { landing: { VITE_ENV: 'LOCAL', VITE_DOU_ENDPOINT: 'x' } }, TABLE)).toEqual([]);
    });

    it('names the apps behind each variant of a key that differs, without its values', () => {
        const problems = checkStage(
            'dev',
            { web: dev, landing: { VITE_ENV: 'DEV', VITE_DOU_ENDPOINT: 'https://dou.prod.test' } },
            TABLE
        );
        expect(problems).toEqual(['VITE_DOU_ENDPOINT differs in the web group — A: web | B: landing']);
        expect(problems.join('\n')).not.toContain('.test');
    });

    it('compares apps only within their group', () => {
        expect(
            checkStage('dev', { web: dev, admin: { VITE_ENV: 'DEV', VITE_DOU_ENDPOINT: 'https://admin.test' } }, TABLE)
        ).toEqual([]);
    });
});

describe('describeDefault', () => {
    const prod = {
        VITE_ENV: 'PROD',
        VITE_DOU_ENDPOINT: 'https://dou.prod.test',
        VITE_WS_ENDPOINT: 'wss://ws.prod.test',
    };
    const carries = TABLE.web.carries;

    it('names the stage whose backend the default file points at, whatever its own VITE_ENV', () => {
        expect(describeDefault({ ...prod, VITE_ENV: 'LOCAL' }, { dev, prod }, carries)).toBe('prod');
    });

    it('ignores the local host and a key only one side sets', () => {
        const local = {
            VITE_ENV: 'LOCAL',
            VITE_HOST: 'http://localhost:5003',
            VITE_DOU_ENDPOINT: dev.VITE_DOU_ENDPOINT,
        };
        expect(
            describeDefault(local, { dev: { ...dev, VITE_HOST: 'https://dev.test' }, prod }, [...carries, 'VITE_HOST'])
        ).toBe('dev');
    });

    it('says none when no stage matches, and unknown when there is none to compare', () => {
        expect(describeDefault({ VITE_DOU_ENDPOINT: 'https://other.test' }, { dev, prod }, carries)).toBe('none');
        expect(describeDefault(dev, { dev: undefined }, carries)).toBe('unknown');
    });
});

describe('readTree and report', () => {
    let root;
    const write = (file, text) => {
        fs.mkdirSync(path.dirname(path.join(root, file)), { recursive: true });
        fs.writeFileSync(path.join(root, file), text);
    };

    beforeEach(() => {
        root = fs.mkdtempSync(path.join(os.tmpdir(), 'check-env-'));
    });
    afterEach(() => fs.rmSync(root, { recursive: true, force: true }));

    it('reports each stage present, fails on a problem, and skips a stage no app has', () => {
        write('apps/web/.env.dev', 'VITE_ENV=DEV\nVITE_DOU_ENDPOINT=https://a.test\nVITE_WS_ENDPOINT=wss://a.test\n');
        write('apps/landing/.env.dev', 'VITE_ENV=DEV\nVITE_DOU_ENDPOINT=https://b.test\n');
        write('apps/web/.env', 'VITE_ENV=LOCAL\nVITE_DOU_ENDPOINT=https://a.test\n');

        const { lines, failed } = report(readTree(root, TABLE), TABLE);

        expect(failed).toBe(true);
        expect(lines).toEqual([
            '.env.dev (web, landing): 1 problem(s)',
            '  ✗ VITE_DOU_ENDPOINT differs in the web group — A: web | B: landing',
            '.env points at: web → dev',
        ]);
        expect(lines.join('\n')).not.toContain('.test');
    });

    it('passes a tree that agrees, and says so when there are no files at all', () => {
        write('apps/web/.env.prod', 'VITE_ENV=PROD\nVITE_DOU_ENDPOINT=https://a.test\nVITE_WS_ENDPOINT=wss://a.test\n');
        expect(report(readTree(root, TABLE), TABLE)).toEqual({ lines: ['.env.prod (web): ok'], failed: false });

        fs.rmSync(path.join(root, 'apps'), { recursive: true });
        expect(report(readTree(root, TABLE), TABLE)).toEqual({
            lines: ['No env files found under apps/<app>/.'],
            failed: false,
        });
    });
});

describe('env-keys', () => {
    it('lists every endpoint the runtime config reads from an env key as a backend key', () => {
        // The net registry is where the runtime takes its server addresses from; a key added there
        // and not here would be one the check never holds the apps to.
        const registry = fs.readFileSync(path.join(__dirname, '../../libs/config/src/registry/net.ts'), 'utf8');
        const keys = [...registry.matchAll(/envDefaultKey:\s*'([A-Z0-9_]+)'/g)].map(match => match[1]);
        expect(keys.length).toBeGreaterThan(0);
        expect(keys.filter(key => !BACKEND_KEYS.includes(key))).toEqual([]);
    });

    it('lets every app carry only backend keys, VITE_ENV among them', () => {
        for (const { carries } of Object.values(APPS)) {
            expect(carries.filter(key => !BACKEND_KEYS.includes(key))).toEqual([]);
            expect(carries).toContain('VITE_ENV');
        }
    });
});
