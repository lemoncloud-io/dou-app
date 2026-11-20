const fs = require('fs');
const os = require('os');
const path = require('path');

const {
    checkShared,
    checkStage,
    describeDefault,
    effectiveValues,
    parseEnv,
    readTree,
    report,
} = require('../check-env');
const { APPS, BACKEND_KEYS, SHARED_FILES, STAGES } = require('../env-keys');

// A small table of its own, so the cases read without the real one's key lists.
const TABLE = {
    web: { group: 'web', readsShared: true, carries: ['VITE_ENV', 'VITE_DOU_ENDPOINT', 'VITE_WS_ENDPOINT'] },
    landing: { group: 'web', readsShared: true, carries: ['VITE_ENV', 'VITE_DOU_ENDPOINT'] },
    mobile: { group: 'web', readsShared: false, carries: ['VITE_ENV', 'VITE_DOU_ENDPOINT'] },
    admin: { group: 'admin', readsShared: true, carries: ['VITE_ENV', 'VITE_DOU_ENDPOINT'] },
};
const dev = { VITE_ENV: 'DEV', VITE_DOU_ENDPOINT: 'https://dou.dev.test', VITE_WS_ENDPOINT: 'wss://ws.dev.test' };
const prod = { VITE_ENV: 'PROD', VITE_DOU_ENDPOINT: 'https://dou.prod.test', VITE_WS_ENDPOINT: 'wss://ws.prod.test' };

/** A tree as readTree returns it, from the parts a case sets. */
const tree = ({ stages = {}, defaults = {}, shared = {} } = {}) => ({
    stages: { dev: {}, prod: {}, localhost: {}, ...stages },
    defaults,
    shared: { dev: null, prod: null, localhost: null, serve: null, ...shared },
});

describe('parseEnv', () => {
    it('reads KEY=value lines and drops comments, blank lines and surrounding quotes', () => {
        const text = '# a comment\n\nVITE_ENV=DEV\nexport VITE_A="quoted"\nVITE_B=\'single\'\nVITE_C=\n';
        expect(parseEnv(text)).toEqual({ VITE_ENV: 'DEV', VITE_A: 'quoted', VITE_B: 'single', VITE_C: '' });
    });

    it('keeps an equals sign inside a value', () => {
        expect(parseEnv('VITE_URL=https://x.test/?a=1&b=2')).toEqual({ VITE_URL: 'https://x.test/?a=1&b=2' });
    });
});

describe('effectiveValues', () => {
    it('reads as Nx loads a build: the app stage file, then its .env, then the shared file', () => {
        const values = effectiveValues(
            'web',
            'dev',
            tree({
                stages: { dev: { web: { VITE_ENV: 'DEV' } } },
                defaults: { web: { VITE_ENV: 'LOCAL', VITE_DOU_ENDPOINT: 'https://own.test' } },
                shared: { dev },
            }),
            TABLE
        );
        expect(values).toEqual({ ...dev, VITE_DOU_ENDPOINT: 'https://own.test' });
    });

    it('lets a blank line in an earlier file leave the later file’s value', () => {
        const values = effectiveValues(
            'web',
            'dev',
            tree({ stages: { dev: { web: { VITE_DOU_ENDPOINT: '' } } }, shared: { dev } }),
            TABLE
        );
        expect(values.VITE_DOU_ENDPOINT).toBe(dev.VITE_DOU_ENDPOINT);
    });

    it('builds a shared-group app from the shared file alone, and an app that reads its own file only from that', () => {
        const t = tree({ stages: { dev: { mobile: { VITE_ENV: 'DEV' } } }, shared: { dev } });
        expect(effectiveValues('landing', 'dev', t, TABLE)).toEqual(dev);
        expect(effectiveValues('mobile', 'dev', t, TABLE)).toEqual({ VITE_ENV: 'DEV' });
    });

    it('has nothing for an app outside the shared group with no file of its own', () => {
        expect(effectiveValues('admin', 'dev', tree({ shared: { dev } }), TABLE)).toBeNull();
        expect(effectiveValues('web', 'dev', tree(), TABLE)).toBeNull();
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

describe('checkShared', () => {
    it('says nothing when there is no shared file for the stage', () => {
        expect(checkShared('dev', tree({ defaults: { web: dev } }), TABLE)).toEqual({ problems: [], notes: [] });
    });

    it('reports a shared file whose VITE_ENV is not its stage', () => {
        expect(checkShared('prod', tree({ shared: { prod: { ...prod, VITE_ENV: 'DEV' } } }), TABLE).problems).toEqual([
            'shared .env.prod: VITE_ENV is not PROD',
        ]);
    });

    it('reports an app .env key that overrides the shared file where the app stage file leaves it out', () => {
        const { problems } = checkShared(
            'prod',
            tree({ defaults: { web: { VITE_DOU_ENDPOINT: dev.VITE_DOU_ENDPOINT } }, shared: { prod } }),
            TABLE
        );
        expect(problems).toEqual([
            'web: VITE_DOU_ENDPOINT in its .env override the shared .env.prod — Nx loads an app’s .env before any root file',
        ]);
        expect(problems.join('\n')).not.toContain('.test');
    });

    it('lets an app .env key pass when the app stage file sets it or it equals the shared value', () => {
        const t = tree({
            stages: { prod: { web: { VITE_DOU_ENDPOINT: prod.VITE_DOU_ENDPOINT } } },
            defaults: {
                web: { VITE_DOU_ENDPOINT: dev.VITE_DOU_ENDPOINT },
                landing: { VITE_WS_ENDPOINT: prod.VITE_WS_ENDPOINT },
            },
            shared: { prod },
        });
        expect(checkShared('prod', t, TABLE).problems).toEqual([]);
    });

    it('notes an app stage file that still holds keys the shared file holds, without failing', () => {
        const t = tree({ stages: { dev: { web: dev } }, shared: { dev } });
        expect(checkShared('dev', t, TABLE)).toEqual({
            problems: [],
            notes: ['web: 3 backend key(s) in its own .env.dev win over the shared file'],
        });
    });

    it('leaves out apps that do not read the shared file', () => {
        const t = tree({ stages: { dev: { mobile: dev } }, defaults: { mobile: prod }, shared: { dev } });
        expect(checkShared('dev', t, TABLE)).toEqual({ problems: [], notes: [] });
    });
});

describe('describeDefault', () => {
    const carries = TABLE.web.carries;

    it('names the stage whose backend the values point at, whatever their own VITE_ENV', () => {
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
    const lines = values =>
        Object.entries(values)
            .map(([key, value]) => `${key}=${value}`)
            .join('\n') + '\n';

    beforeEach(() => {
        root = fs.mkdtempSync(path.join(os.tmpdir(), 'check-env-'));
    });
    afterEach(() => fs.rmSync(root, { recursive: true, force: true }));

    it('reports each stage present, fails on a problem, and skips a stage nothing reads', () => {
        write('apps/web/.env.dev', lines(dev));
        write('apps/landing/.env.dev', 'VITE_ENV=DEV\nVITE_DOU_ENDPOINT=https://b.test\n');
        write('apps/web/.env', `VITE_ENV=LOCAL\nVITE_DOU_ENDPOINT=${dev.VITE_DOU_ENDPOINT}\n`);

        const result = report(readTree(root, TABLE), TABLE);

        expect(result.failed).toBe(true);
        expect(result.lines).toEqual([
            '.env.dev (web, landing): 1 problem(s)',
            '  ✗ VITE_DOU_ENDPOINT differs in the web group — A: web | B: landing',
            'a dev server talks to: web → dev',
        ]);
        expect(result.lines.join('\n')).not.toContain('.test');
    });

    it('passes a tree moved to the shared files, the phone app keeping its own copy', () => {
        write('.env.dev', lines(dev));
        write('.env.prod', lines(prod));
        write('.env.serve', lines({ ...dev, VITE_ENV: 'LOCAL' }));
        write('apps/web/.env', 'VITE_DEBUG_CODE=000000\n');
        write('apps/mobile/.env.dev', lines({ VITE_ENV: 'DEV', VITE_DOU_ENDPOINT: dev.VITE_DOU_ENDPOINT }));

        expect(report(readTree(root, TABLE), TABLE)).toEqual({
            lines: [
                '.env.dev (shared, web, landing, mobile): ok',
                '.env.prod (shared, web, landing): ok',
                'a dev server talks to: web → dev, landing → dev',
            ],
            failed: false,
        });
    });

    it('fails when an app .env would override the shared file in a build', () => {
        write('.env.prod', lines(prod));
        write('apps/web/.env', lines(dev));

        const { lines: out, failed } = report(readTree(root, TABLE), TABLE);
        expect(failed).toBe(true);
        expect(out[1]).toBe(
            '  ✗ web: VITE_ENV, VITE_WS_ENDPOINT, VITE_DOU_ENDPOINT in its .env override the shared .env.prod — Nx loads an app’s .env before any root file'
        );
    });

    it('says so when there are no files at all', () => {
        expect(report(readTree(root, TABLE), TABLE)).toEqual({
            lines: ['No env files found under apps/<app>/ or at the root.'],
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

    it('lets every app carry only backend keys, VITE_ENV among them, and say whether it reads the shared files', () => {
        for (const { carries, readsShared } of Object.values(APPS)) {
            expect(carries.filter(key => !BACKEND_KEYS.includes(key))).toEqual([]);
            expect(carries).toContain('VITE_ENV');
            expect(typeof readsShared).toBe('boolean');
        }
    });

    it('names a shared file for every stage, and one for dev servers', () => {
        expect(Object.keys(SHARED_FILES).sort()).toEqual([...STAGES, 'serve'].sort());
    });
});
