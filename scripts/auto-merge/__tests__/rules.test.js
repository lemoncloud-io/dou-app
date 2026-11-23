const test = require('node:test');
const assert = require('node:assert/strict');
const rules = require('../rules');

test('every always-excluded path family is excluded', () => {
    const excluded = [
        'docs/adr/0365-auto-merge.md',
        'AGENTS.md',
        'CLAUDE.md',
        'apps/web/AGENTS.md',
        'docs/config/skills/dou-pr/SKILL.md',
        '.claude/settings.json',
        '.github/workflows/verify.yml',
        '.github/pull_request_template.md',
        'eslint.config.mjs',
        'apps/web/eslint.config.mjs',
        'tools/eslint-rules/no-comments.js',
        '.prettierrc',
        '.husky/pre-commit',
        'commitlint.config.js',
        'package.json',
        'libs/runtime/package.json',
        'yarn.lock',
        'apps/mobile/ios/Podfile.lock',
        'apps/mobile/ios/App/AppDelegate.swift',
        'apps/mobile/android/app/build.gradle',
        'scripts/deploy-web.sh',
        'scripts/version-update.js',
        'docs/infra/deferred-link/index.js',
        'CHANGELOG.md',
        'scripts/auto-merge/classify.js',
        'scripts/check-env.js',
        'apps/web/.env',
        'apps/web/.env.dev',
        'apps/web/project.json',
        'tsconfig.base.json',
        'libs/runtime/tsconfig.lib.json',
        'apps/web/vite.config.mts',
        'libs/runtime/jest.config.ts',
        'nx.json',
        'apps/web-e2e/src/visual.spec.ts-snapshots/home-webkit.png',
        'libs/x/src/__snapshots__/a.test.ts.snap',
    ];
    for (const path of excluded) assert.ok(rules.excludedBy(path), `${path} should be excluded`);
});

test('ordinary source, tests and module docs are not excluded', () => {
    for (const path of [
        'apps/web/src/app/x.tsx',
        'libs/runtime/src/a.test.ts',
        'apps/web/docs/feature/chat/README.md',
        'README.md',
        'scripts/__tests__/check-env.test.js',
    ]) {
        assert.equal(rules.excludedBy(path), null, path);
    }
});

test('test file detection covers suffixes, __tests__, __mocks__ and e2e projects', () => {
    for (const path of [
        'a/b.test.ts',
        'a/b.spec.tsx',
        'a/__tests__/x.js',
        'a/__mocks__/y.ts',
        'apps/web-e2e/src/fixtures/shell.ts',
        'apps/desktop-web-e2e/a.ts',
    ]) {
        assert.ok(rules.isTestFile(path), path);
    }
    for (const path of ['apps/web/src/testing.ts', 'apps/web/src/contest.ts']) assert.ok(!rules.isTestFile(path), path);
});

test('module docs are markdown under apps or libs, minus excluded ones', () => {
    assert.ok(rules.isModuleDoc('libs/runtime/README.md'));
    assert.ok(rules.isModuleDoc('apps/web/docs/bridge/push.md'));
    assert.ok(!rules.isModuleDoc('docs/adr/0001-x.md'));
    assert.ok(!rules.isModuleDoc('README.md'));
    assert.ok(!rules.isModuleDoc('apps/web/AGENTS.md'));
    assert.ok(!rules.isModuleDoc('apps/web/CHANGELOG.md'));
});

test('baseline patterns have defaults and an environment override', () => {
    assert.ok(rules.isBaseline('tools/ratchet/comments.json'));
    assert.ok(rules.isBaseline('scripts/comment-ratchet-baseline.json'));
    assert.ok(!rules.isBaseline('apps/web/src/data.json'));
    const custom = rules.baselinePatterns({ AUTO_MERGE_BASELINE_PATTERNS: '^lint/baseline\\.json$, ^x/' });
    assert.ok(rules.isBaseline('lint/baseline.json', custom));
    assert.ok(!rules.isBaseline('tools/ratchet/comments.json', custom));
});

test('projectOf maps apps and libs and returns null at the root', () => {
    assert.equal(rules.projectOf('apps/web/src/a.ts'), 'apps/web');
    assert.equal(rules.projectOf('libs/runtime-core/src/a.ts'), 'libs/runtime-core');
    assert.equal(rules.projectOf('scripts/a.js'), null);
});
