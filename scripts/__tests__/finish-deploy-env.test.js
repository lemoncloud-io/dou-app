const fs = require('fs');
const path = require('path');

const { finishDeployEnv } = require('../finish-deploy-env');
const { APPS, BACKEND_KEYS } = require('../env-keys');

/** A file with every key `project` carries set, as a deploy of `stage` writes it. */
const complete = (project, stage) =>
    APPS[project].carries
        .map(key => `${key}=${key === 'VITE_ENV' ? stage.toUpperCase() : `https://${key}.test`}`)
        .join('\n');

describe('finishDeployEnv', () => {
    it('drops the empty lines and keeps the rest in order', () => {
        const { text, keys, problems } = finishDeployEnv(
            `${complete('landing', 'dev')}\nVITE_D1_RELAY_ENDPOINT=\n\n`,
            'landing',
            'dev'
        );
        expect(problems).toEqual([]);
        expect(keys).toEqual(APPS.landing.carries);
        expect(text).toBe(`${complete('landing', 'dev')}\n`);
    });

    it('keeps a value that ends in an equals sign', () => {
        const { keys } = finishDeployEnv(`${complete('landing', 'dev')}\nVITE_DEBUG_CODE=abc=`, 'landing', 'dev');
        expect(keys).toContain('VITE_DEBUG_CODE');
    });

    it('stops on a backend key the app carries that came out empty, naming it and not its value', () => {
        const text = complete('web', 'prod').replace(/^VITE_WS_ENDPOINT=.*$/m, 'VITE_WS_ENDPOINT=');
        const { problems, keys } = finishDeployEnv(text, 'web', 'prod');
        expect(problems).toEqual(['VITE_WS_ENDPOINT not set — check the prod secrets for web']);
        expect(keys).not.toContain('VITE_WS_ENDPOINT');
        expect(problems.join('\n')).not.toContain('.test');
    });

    it('stops on a VITE_ENV that is not the deployed stage', () => {
        expect(finishDeployEnv(complete('admin', 'dev'), 'admin', 'prod').problems).toEqual(['VITE_ENV is not PROD']);
    });

    it('stops on a stage it does not know', () => {
        expect(finishDeployEnv(complete('web', 'dev'), 'web', 'staging').problems).toEqual(["unknown stage 'staging'"]);
    });

    it('only tidies a project the key table does not list', () => {
        expect(finishDeployEnv('VITE_A=\nVITE_B=1\n', 'block-kit-builder', 'dev')).toEqual({
            text: 'VITE_B=1\n',
            keys: ['VITE_B'],
            problems: [],
        });
    });
});

describe('the deploy workflows', () => {
    const WORKFLOWS = ['deploy-dev.yml', 'deploy-prod.yml', 'force-deploy.yml'];
    const read = name => fs.readFileSync(path.join(__dirname, '../../.github/workflows', name), 'utf8');

    /** Every env file a workflow writes: the heredoc and the command that finishes it. */
    const envSteps = source =>
        [
            ...source.matchAll(
                /cat > "\$ENV_FILE" << 'EOF'\n([\s\S]*?)\n\s*EOF\n[\s\S]*?node scripts\/finish-deploy-env\.js \$\{\{ matrix\.project \}\} (\w+)/g
            ),
        ].map(([, heredoc, stage]) => ({ heredoc, stage }));

    it.each(WORKFLOWS)('%s finishes every env file it writes', name => {
        const source = read(name);
        const written = (source.match(/cat > "\$ENV_FILE" << 'EOF'/g) || []).length;
        expect(written).toBeGreaterThan(0);
        expect(envSteps(source)).toHaveLength(written);
        expect(source).not.toContain("grep -v '=$'");
    });

    it.each(WORKFLOWS)('%s writes every backend key from the secrets of the stage it deploys', name => {
        for (const { heredoc, stage } of envSteps(read(name))) {
            const STAGE = stage.toUpperCase();
            for (const key of BACKEND_KEYS) {
                const secret = key.replace(/^VITE_/, '');
                expect(heredoc).toContain(`${key}=\${{ secrets[format('{0}_${STAGE}_${secret}', matrix.prefix)] }}`);
            }
            expect(heredoc).not.toMatch(new RegExp(`'\\{0\\}_${STAGE === 'DEV' ? 'PROD' : 'DEV'}_`));
        }
    });
});
