const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');

const {
    parseConventional,
    categoryOf,
    highestCategory,
    isLegacyVersionBump,
    proposeUnit,
} = require('../mobile-release/commits');
const {
    mobileDependencyRoots,
    allProjectRoots,
    binaryRoots,
    reachesBinary,
    isNativeSource,
    isPermissionFile,
    addedPermissions,
    addedDependencies,
} = require('../mobile-release/paths');
const {
    parseTag,
    compareVersions,
    bumpVersion,
    nextBuildNumber,
    latestTag,
    resolveUnit,
    resolveVersion,
} = require('../mobile-release/version');
const { parseReplacers, applyReplacers, teamNotes, checkStoreNotes } = require('../mobile-release/notes');
const { buildPlan, pickPr, summarize, parseArgs, unitBetween, resolveBuild } = require('../mobile-release/plan');
const { releaseBody, prComment, finish, marker, tagMessage, parseTagMessage } = require('../mobile-release/finish');
const release = require('../mobile-release/release');
const { injectIosVersion } = require('../mobile-release/ios-version');
const store = require('../mobile-release/store');

const ROOTS = binaryRoots(['libs/runtime', 'libs/data']);

describe('mobile-release commits', () => {
    it('Conventional Commits 타입과 스코프를 읽는다', () => {
        expect(parseConventional('feat(mobile): add x')).toEqual({ type: 'feat', scope: 'mobile', breaking: false });
        expect(parseConventional('fix: y')).toEqual({ type: 'fix', scope: null, breaking: false });
        expect(parseConventional('[Mobile] free text')).toEqual({ type: null, scope: null, breaking: false });
    });

    it('`!` 또는 본문의 BREAKING CHANGE를 호환성 변경으로 본다', () => {
        expect(parseConventional('feat(bridge)!: drop v1').breaking).toBe(true);
        expect(parseConventional('refactor: x', 'details\n\nBREAKING CHANGE: removed').breaking).toBe(true);
        expect(parseConventional('fix: x', 'mentions breaking change in prose').breaking).toBe(false);
    });

    it('분류는 ! > feat > fix > perf·refactor > 기타 순서다', () => {
        expect(categoryOf({ type: 'feat', breaking: true })).toBe('breaking');
        expect(categoryOf({ type: 'perf', breaking: false })).toBe('improve');
        expect(categoryOf({ type: 'refactor', breaking: false })).toBe('improve');
        expect(categoryOf({ type: 'chore', breaking: false })).toBe('other');
        expect(categoryOf({ type: null, breaking: false })).toBe('other');
        expect(highestCategory(['fix', 'other', 'feat', 'improve'])).toBe('feat');
        expect(highestCategory(['fix', 'breaking'])).toBe('breaking');
    });

    it('예전 버전 올림 커밋을 알아본다', () => {
        expect(isLegacyVersionBump('chore(mobile): bump app versions 0.32.5')).toBe(true);
        expect(isLegacyVersionBump('chore(mobile): bump app versions to 0.24.1')).toBe(true);
        expect(isLegacyVersionBump('chore(mobile): bump build number to 63')).toBe(true);
        expect(isLegacyVersionBump('chore(release): bump root version to 0.175.2 [skip ci]')).toBe(false);
    });

    describe('proposeUnit', () => {
        const commit = (type, extra = {}) => ({
            sha: `${type}-sha`,
            subject: `${type}: x`,
            type,
            breaking: false,
            ...extra,
        });
        const signal = {
            kind: 'native-source',
            file: 'apps/mobile/android/a/XPackage.kt',
            detail: 'new',
            sha: 's',
            pr: 7,
        };

        it('feat 커밋만 있으면 patch를 제안한다', () => {
            const result = proposeUnit([commit('fix'), commit('feat'), commit('feat')]);
            expect(result).toEqual({ unit: 'patch', reasons: [], featCommits: 2 });
        });

        it('네이티브 신호가 있으면 fix만 있어도 minor를 제안하고 신호 파일을 근거로 든다', () => {
            const result = proposeUnit([commit('fix')], [signal]);
            expect(result.unit).toBe('minor');
            expect(result.reasons).toEqual([{ sha: 's', file: signal.file, detail: 'new', pr: 7, why: 'native' }]);
        });

        it('! 가 있으면 신호가 있어도 major를 제안하고 근거로 그 커밋만 든다', () => {
            const result = proposeUnit([commit('feat'), commit('feat', { breaking: true, sha: 'b' })], [signal]);
            expect(result.unit).toBe('major');
            expect(result.reasons.map(item => item.sha)).toEqual(['b']);
        });

        it('커밋이 없으면 단위를 제안하지 않는다', () => {
            expect(proposeUnit([])).toEqual({ unit: null, reasons: [] });
        });
    });
});

describe('mobile-release paths', () => {
    const graph = {
        nodes: {
            '@chatic/mobile': { data: { root: 'apps/mobile' } },
            '@chatic/runtime': { data: { root: 'libs/runtime' } },
            '@chatic/data': { data: { root: 'libs/data' } },
            '@chatic/web': { data: { root: 'apps/web' } },
            '@chatic/ui': { data: { root: 'libs/ui' } },
        },
        dependencies: {
            '@chatic/mobile': [{ target: '@chatic/runtime' }, { target: 'npm:react' }],
            '@chatic/runtime': [{ target: '@chatic/data' }],
            '@chatic/web': [{ target: '@chatic/ui' }],
        },
    };

    it('nx 그래프에서 mobile이 기대는 lib을 전이적으로 모은다', () => {
        expect(mobileDependencyRoots(graph)).toEqual(['libs/data', 'libs/runtime']);
    });

    it('mobile 프로젝트가 그래프에 없으면 에러를 던진다', () => {
        expect(() => mobileDependencyRoots({ nodes: {}, dependencies: {} })).toThrow('No nx project');
    });

    it('apps/mobile과 의존 lib의 소스만 바이너리 경로로 본다', () => {
        expect(reachesBinary('apps/mobile/src/App.tsx', ROOTS)).toBe(true);
        expect(reachesBinary('libs/data/src/x.ts', ROOTS)).toBe(true);
        expect(reachesBinary('libs/database/src/x.ts', ROOTS)).toBe(false);
        expect(reachesBinary('apps/web/src/x.ts', ROOTS)).toBe(false);
    });

    it('의존 lib 폴더 안에 있어도 mobile이 기대지 않는 하위 프로젝트는 빼고, 설정 파일도 뺀다', () => {
        const others = ['libs/runtime/node', 'apps/web'];
        expect(reachesBinary('libs/runtime/node/src/boot.ts', ROOTS, others)).toBe(false);
        expect(reachesBinary('libs/runtime/src/boot.ts', ROOTS, others)).toBe(true);
        expect(
            reachesBinary('apps/mobile/src/a.ts', binaryRoots(['libs/runtime', 'apps/mobile/sub']), ['apps/mobile'])
        ).toBe(true);
        for (const file of [
            'libs/runtime/project.json',
            'libs/runtime/jest.config.ts',
            'libs/runtime/eslint.config.mjs',
            'libs/runtime/tsconfig.spec.json',
            'apps/mobile/.gitignore',
        ]) {
            expect(reachesBinary(file, ROOTS)).toBe(false);
        }
        expect(reachesBinary('apps/mobile/babel.config.js', ROOTS)).toBe(true);
        expect(allProjectRoots({ nodes: { a: { data: { root: 'libs/a' } }, b: { data: { root: '.' } } } })).toEqual([
            'libs/a',
        ]);
    });

    it('문서·테스트·e2e·fastlane은 바이너리에 들지 않는다', () => {
        for (const file of [
            'apps/mobile/README.md',
            'apps/mobile/docs/release/deploy.md',
            'libs/runtime/src/a.test.ts',
            'libs/runtime/src/a.spec.tsx',
            'libs/runtime/src/__tests__/a.ts',
            'apps/mobile/e2e/flows/a.yaml',
            'apps/mobile/fastlane/Fastfile',
            'apps/mobile/android/app/src/test/java/AppTest.kt',
        ]) {
            expect(reachesBinary(file, ROOTS)).toBe(false);
        }
    });

    it('새 네이티브 소스는 ios의 .m·.mm·.swift와 android의 *Package.kt만 센다', () => {
        expect(isNativeSource('apps/mobile/ios/Chatic/Haptic.swift')).toBe(true);
        expect(isNativeSource('apps/mobile/ios/Chatic/Haptic.m')).toBe(true);
        expect(isNativeSource('apps/mobile/ios/Chatic/Haptic.mm')).toBe(true);
        expect(isNativeSource('apps/mobile/android/app/src/main/java/io/HapticPackage.kt')).toBe(true);
        expect(isNativeSource('apps/mobile/android/app/src/main/java/io/HapticModule.kt')).toBe(false);
        expect(isNativeSource('apps/mobile/android/app/build.gradle')).toBe(false);
        expect(isNativeSource('apps/mobile/ios/Chatic.xcodeproj/project.pbxproj')).toBe(false);
        expect(isNativeSource('apps/mobile/src/haptic.swift')).toBe(false);
    });

    it('AndroidManifest와 앱 Info.plist에서 새 권한만 돌려준다', () => {
        expect(isPermissionFile('apps/mobile/android/app/src/main/AndroidManifest.xml')).toBe(true);
        expect(isPermissionFile('apps/mobile/ios/Chatic/Info.plist')).toBe(true);
        expect(isPermissionFile('apps/mobile/ios/Chatic/Sub/Info.plist')).toBe(false);
        const manifest = names =>
            `<manifest>${names.map(name => `<uses-permission android:name="${name}" />`).join('')}<application/></manifest>`;
        expect(addedPermissions(manifest(['a.CAMERA']), manifest(['a.CAMERA', 'a.RECORD_AUDIO']))).toEqual([
            'a.RECORD_AUDIO',
        ]);
        expect(addedPermissions(manifest(['a.CAMERA', 'a.X']), manifest(['a.X', 'a.CAMERA']))).toEqual([]);
        const plist = keys => `<dict>${keys.map(key => `<key>${key}</key><string>why</string>`).join('')}</dict>`;
        expect(
            addedPermissions(
                plist(['NSCameraUsageDescription']),
                plist(['NSCameraUsageDescription', 'NSMicrophoneUsageDescription', 'UIStatusBarStyle'])
            )
        ).toEqual(['NSMicrophoneUsageDescription']);
    });

    it('새로 더한 dependencies 이름만 돌려준다', () => {
        const before = JSON.stringify({ dependencies: { a: '1.0.0' }, devDependencies: {} });
        const after = JSON.stringify({ dependencies: { a: '2.0.0', b: '1.0.0' }, devDependencies: { c: '1' } });
        expect(addedDependencies(before, after)).toEqual(['b']);
        expect(addedDependencies(null, after)).toEqual(['a', 'b']);
    });
});

describe('mobile-release version', () => {
    it('mobile-v 태그만 읽는다', () => {
        expect(parseTag('mobile-v0.33.0-120')).toEqual({ name: 'mobile-v0.33.0-120', version: '0.33.0', build: 120 });
        expect(parseTag('0.36.0')).toBeNull();
        expect(parseTag('desktop-prod')).toBeNull();
        expect(parseTag('mobile-v0.33-1')).toBeNull();
    });

    it('버전을 비교하고 올린다', () => {
        expect(compareVersions('0.10.0', '0.9.9')).toBe(1);
        expect(compareVersions('0.32.5', '0.32.5')).toBe(0);
        expect(bumpVersion('0.32.5', 'patch')).toBe('0.32.6');
        expect(bumpVersion('0.32.5', 'minor')).toBe('0.33.0');
        expect(bumpVersion('0.32.5', 'major')).toBe('1.0.0');
        expect(() => bumpVersion('0.32.5', 'build')).toThrow('Unknown bump unit');
    });

    it('빌드 번호는 모든 mobile-v 태그 중 가장 큰 값 + 1이고, 태그가 없으면 versionCode 바닥값 + 1이다', () => {
        expect(nextBuildNumber([], 99)).toBe(100);
        expect(nextBuildNumber(['mobile-v0.33.0-120', 'mobile-v0.32.6-118', 'desktop-prod', 'v9.9.9'], 99)).toBe(121);
        expect(nextBuildNumber(['mobile-v0.1.0-5'], 99)).toBe(100);
    });

    it('직접 준 빌드 번호는 다음 빈 번호보다 작으면 멈춘다', () => {
        expect(resolveBuild(121)).toBe(121);
        expect(resolveBuild(121, '')).toBe(121);
        expect(resolveBuild(121, '130')).toBe(130);
        expect(resolveBuild(121, 121)).toBe(121);
        expect(() => resolveBuild(121, '120')).toThrow('below 121');
        expect(() => resolveBuild(121, '1e3')).toThrow('whole number');
    });

    it('가장 큰 빌드 번호의 태그를 고른다', () => {
        expect(latestTag(['mobile-v0.33.0-120', 'mobile-v0.33.1-121', 'x']).name).toBe('mobile-v0.33.1-121');
        expect(latestTag([])).toBeNull();
    });

    it('auto는 major 제안을 minor로 낸다', () => {
        expect(resolveUnit('major')).toBe('minor');
        expect(resolveUnit('major', 'major')).toBe('major');
        expect(resolveUnit('minor', 'patch')).toBe('patch');
        expect(resolveUnit(null)).toBe('patch');
        expect(() => resolveUnit('minor', 'build')).toThrow('bump must be');
    });

    it('제안 버전은 기준 버전을 올린 값이되 직전 dev 태그보다 낮아지지 않는다', () => {
        expect(resolveVersion({ base: '0.32.5', unit: 'patch' })).toBe('0.32.6');
        expect(resolveVersion({ base: '0.32.5', unit: 'minor', devTags: ['mobile-v0.32.6-100'] })).toBe('0.33.0');
        expect(resolveVersion({ base: '0.32.5', unit: 'patch', devTags: ['mobile-v0.33.0-101'] })).toBe('0.33.0');
    });

    it('직접 준 버전은 기준 버전보다 높아야 한다', () => {
        expect(resolveVersion({ base: '0.32.5', unit: 'patch', requested: '0.40.0' })).toBe('0.40.0');
        expect(() => resolveVersion({ base: '0.32.5', unit: 'patch', requested: '0.32.5' })).toThrow('must be higher');
        expect(() => resolveVersion({ base: '0.32.5', unit: 'patch', requested: 'v1' })).toThrow('X.Y.Z');
    });
});

describe('mobile-release notes', () => {
    const yaml = [
        "name-template: 'v$RESOLVED_VERSION'",
        'replacers:',
        "    - search: 'raine-lemon'",
        "      replace: '레인'",
        "    - search: '/#(\\d+)/g'",
        "      replace: '[#$1](https://github.com/o/r/pull/$1)'",
        'version-resolver:',
        '    default: patch',
    ].join('\n');

    it('release-drafter.yml의 replacers를 읽고 적용한다', () => {
        const replacers = parseReplacers(yaml);
        expect(replacers).toEqual([
            { search: 'raine-lemon', replace: '레인' },
            { search: '/#(\\d+)/g', replace: '[#$1](https://github.com/o/r/pull/$1)' },
        ]);
        expect(applyReplacers('- x @raine-lemon (#12)', replacers)).toBe(
            '- x @레인 ([#12](https://github.com/o/r/pull/12))'
        );
    });

    it('replacers가 없으면 빈 목록이다', () => {
        expect(parseReplacers('name-template: x')).toEqual([]);
    });

    it('팀용 노트를 커밋 타입으로 묶어 영어 머리말로 적고 PR 없는 커밋은 sha로 적는다', () => {
        const prs = [
            { number: 3, title: 'fix it', author: 'a', category: 'fix' },
            { number: 1, title: 'add it', author: 'b', category: 'feat' },
            { number: 2, title: 'drop v1', author: 'a', category: 'breaking' },
        ];
        const direct = [{ sha: 'abcdef1234', subject: 'chore: tidy', category: 'other' }];
        expect(teamNotes(prs, direct)).toBe(
            [
                '### Breaking',
                '',
                '- drop v1 @a (#2)',
                '',
                '### Features',
                '',
                '- add it @b (#1)',
                '',
                '### Fixes',
                '',
                '- fix it @a (#3)',
                '',
                '### Other',
                '',
                '- chore: tidy (abcdef1)',
            ].join('\n')
        );
        expect(
            teamNotes(prs, direct, [], 'ko')
                .split('\n')
                .filter(line => line.startsWith('###'))
        ).toEqual(['### 호환성 변경', '### 새 기능', '### 수정', '### 기타']);
    });

    it('대상이 없으면 그렇다고 적는다', () => {
        expect(teamNotes([], [])).toBe('No change reached the mobile binary.');
        expect(teamNotes([], [], [], 'ko')).toBe('모바일 바이너리에 들어간 변경이 없습니다.');
    });

    it('스토어용 노트는 비었거나 500자를 넘으면 실패한다', () => {
        expect(checkStoreNotes('  \n').ok).toBe(false);
        expect(checkStoreNotes('a'.repeat(500))).toEqual({ ok: true, length: 500, error: null });
        expect(checkStoreNotes('a'.repeat(501))).toEqual(expect.objectContaining({ ok: false, length: 501 }));
        expect(checkStoreNotes('가'.repeat(500)).ok).toBe(true);
    });
});

describe('mobile-release plan', () => {
    let dir;
    const run = (args, extra = {}) => execFileSync('git', args, { cwd: dir, encoding: 'utf8', ...extra }).trim();
    const tryRun = args => {
        try {
            return run(args, { stdio: ['ignore', 'pipe', 'ignore'] });
        } catch {
            return null;
        }
    };
    const write = (file, text) => {
        fs.mkdirSync(path.dirname(path.join(dir, file)), { recursive: true });
        fs.writeFileSync(path.join(dir, file), text);
    };
    const commit = (subject, files, body = '') => {
        for (const [file, text] of Object.entries(files)) write(file, text);
        run(['add', '-A']);
        run(['commit', '-q', '-m', subject, ...(body ? ['-m', body] : [])]);
        return run(['rev-parse', 'HEAD']);
    };
    const gradle = (name, code) =>
        `android {\n    defaultConfig {\n        versionCode ${code}\n        versionName "${name}"\n    }\n}\n`;
    const pulls = {};
    const deps = () => ({
        git: args => run(args, { maxBuffer: 1e8 }),
        tryGit: tryRun,
        gh: async args => {
            const sha = /commits\/(\w+)\/pulls/.exec(args[1] || '');
            if (sha) return JSON.stringify(pulls[sha[1]] || []);
            throw new Error('no gh');
        },
        repoSlug: () => 'o/r',
        nxGraph: () => ({
            nodes: { m: { data: { root: 'apps/mobile' } }, r: { data: { root: 'libs/runtime' } } },
            dependencies: { m: [{ target: 'r' }] },
        }),
        mapLimit: (items, limit, fn) => Promise.all(items.map(fn)),
        readFile: file => fs.readFileSync(path.join(dir, file), 'utf8'),
        warn: () => undefined,
    });
    let shas;

    beforeAll(() => {
        dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mobile-release-plan-'));
        run(['init', '-q', '-b', 'develop']);
        run(['config', 'user.email', 'test@example.com']);
        run(['config', 'user.name', 'tester']);
        write('.github/release-drafter.yml', "replacers:\n    - search: 'tester'\n      replace: '테스터'\n");
        commit('chore: init', { 'apps/mobile/package.json': '{"dependencies":{"a":"1"}}', 'README.md': 'x' });
        shas = {};
        shas.bump = commit('chore(mobile): bump app versions 0.32.5', {
            'apps/mobile/android/app/build.gradle': gradle('0.32.5', 99),
        });
        shas.web = commit('feat(web): web only', { 'apps/web/src/a.ts': '1' });
        shas.lib = commit('fix(runtime): lib only', { 'libs/runtime/src/a.ts': '1' });
        shas.docs = commit('feat(mobile): docs only', {
            'apps/mobile/docs/a.md': '1',
            'libs/runtime/src/a.test.ts': '1',
        });
        shas.app = commit('fix(mobile): app fix', { 'apps/mobile/src/a.ts': '1' });
        pulls[shas.lib] = [
            {
                number: 7,
                title: 'Runtime fix',
                user: { login: 'tester' },
                html_url: 'u7',
                merged_at: '2026-11-25T00:00:00Z',
                base: { ref: 'develop' },
            },
        ];
        pulls[shas.app] = [
            {
                number: 9,
                title: 'Later stack',
                user: { login: 'x' },
                html_url: 'u9',
                merged_at: '2026-11-27T00:00:00Z',
                base: { ref: 'develop' },
            },
            {
                number: 8,
                title: 'App fix',
                user: { login: 'tester' },
                html_url: 'u8',
                merged_at: '2026-11-26T00:00:00Z',
                base: { ref: 'develop' },
            },
        ];
    });

    afterAll(() => fs.rmSync(dir, { recursive: true, force: true }));

    it('웹만 바꾼 커밋과 문서·테스트 커밋은 빼고, lib만 바꾼 커밋은 넣는다', async () => {
        const plan = await buildPlan({ prodTags: [] }, deps());
        expect(plan.commits.map(c => c.sha)).toEqual([shas.app, shas.lib]);
        expect(plan.prs.map(pr => pr.number)).toEqual([7, 8]);
    });

    it('fix만 있으면 patch, 기준 버전은 build.gradle의 versionName이고 빌드 번호는 versionCode + 1이다', async () => {
        const plan = await buildPlan({ prodTags: [] }, deps());
        expect(plan.base).toEqual(
            expect.objectContaining({ version: '0.32.5', source: 'build.gradle', commit: shas.bump })
        );
        expect(plan.proposal.unit).toBe('patch');
        expect(plan.release).toEqual(
            expect.objectContaining({ unit: 'patch', version: '0.32.6', build: 100, tag: 'mobile-v0.32.6-100' })
        );
        expect(plan.release.buildBasis).toEqual({ tags: null, store: null, gradle: 99, computed: 100 });
        expect(plan.teamNotes).toContain('- App fix @테스터 (#8)');
        expect(plan.teamNotes).toContain('### Fixes');
        expect(plan.cardNotes).toContain('### 수정');
        expect(summarize(plan)).toContain('0.32.6 patch → mobile-v0.32.6-100');
        expect(summarize(plan)).toContain('100 (highest of tags none, gradle 99, store not read, plus one)');
        expect(summarize(plan)).toContain('patch — no native signal (0 feat commit(s) count as patch)');
    });

    it('직전 mobile-v 태그 이후만 노트에 넣고, 빌드 번호는 태그에서 잇는다', async () => {
        run(['tag', '-a', 'mobile-v0.32.6-100', shas.lib, '-m', 'dev']);
        try {
            const plan = await buildPlan({ prodTags: [] }, deps());
            expect(plan.lastTag).toBe('mobile-v0.32.6-100');
            expect(plan.prs.map(pr => pr.number)).toEqual([8]);
            expect(plan.proposal.unit).toBe('patch');
            expect(plan.release.build).toBe(101);
            expect(plan.release.version).toBe('0.32.6');
        } finally {
            run(['tag', '-d', 'mobile-v0.32.6-100']);
        }
    });

    const proposalAfter = async files => {
        const head = run(['rev-parse', 'HEAD']);
        try {
            for (const [subject, changes] of files) commit(subject, changes);
            return await buildPlan({ prodTags: [], prs: false }, deps());
        } finally {
            run(['reset', '-q', '--hard', head]);
        }
    };

    it('feat 커밋과 빌드 설정 변경만 있으면 patch다', async () => {
        const plan = await proposalAfter([
            ['feat(mobile): new screen', { 'apps/mobile/src/b.ts': '1' }],
            ['build(mobile): gradle', { 'apps/mobile/android/app/build.gradle': `${gradle('0.32.5', 99)}// x\n` }],
            ['build(mobile): pbxproj', { 'apps/mobile/ios/Chatic.xcodeproj/project.pbxproj': 'x' }],
            ['feat(mobile): new kotlin module', { 'apps/mobile/android/app/src/main/java/io/HapticModule.kt': 'x' }],
        ]);
        expect(plan.proposal).toEqual(expect.objectContaining({ unit: 'patch', featCommits: 2 }));
        expect(plan.signals).toEqual([]);
        expect(plan.release.version).toBe('0.32.6');
    });

    it('새 네이티브 소스·Podfile.lock·새 권한은 minor 신호다', async () => {
        const source = await proposalAfter([
            ['fix(mobile): haptics', { 'apps/mobile/android/app/src/main/java/io/HapticPackage.kt': 'x' }],
        ]);
        expect(source.proposal.unit).toBe('minor');
        expect(source.signals).toEqual([
            expect.objectContaining({
                kind: 'native-source',
                file: 'apps/mobile/android/app/src/main/java/io/HapticPackage.kt',
            }),
        ]);
        expect(source.release.version).toBe('0.33.0');
        expect(summarize(source)).toContain(
            'minor — new native source file (apps/mobile/android/app/src/main/java/io/HapticPackage.kt)'
        );

        const pods = await proposalAfter([['chore(mobile): pods', { 'apps/mobile/ios/Podfile.lock': 'PODS: []' }]]);
        expect(pods.signals.map(item => item.kind)).toEqual(['podfile-lock']);

        const plist = keys => `<dict>${keys.map(key => `<key>${key}</key><string>x</string>`).join('')}</dict>`;
        const head = run(['rev-parse', 'HEAD']);
        try {
            commit('chore(mobile): plist', {
                'apps/mobile/ios/Chatic/Info.plist': plist(['NSCameraUsageDescription']),
            });
            const base = run(['rev-parse', 'HEAD']);
            commit('fix(mobile): reword', {
                'apps/mobile/ios/Chatic/Info.plist': plist(['NSCameraUsageDescription', 'UIX']),
            });
            const reword = await buildPlan({ prodTags: [], prs: false, from: base }, deps());
            expect(reword.proposal.unit).toBe('patch');
            commit('feat(mobile): mic', {
                'apps/mobile/ios/Chatic/Info.plist': plist([
                    'NSCameraUsageDescription',
                    'NSMicrophoneUsageDescription',
                ]),
            });
            const mic = await buildPlan({ prodTags: [], prs: false, from: base }, deps());
            expect(mic.signals).toEqual([
                expect.objectContaining({ kind: 'permission', detail: 'new permission NSMicrophoneUsageDescription' }),
            ]);
        } finally {
            run(['reset', '-q', '--hard', head]);
        }
    });

    it('!는 major 제안이지만 auto는 minor로 낸다', async () => {
        const head = run(['rev-parse', 'HEAD']);
        try {
            commit('feat(runtime)!: drop the v1 bridge', { 'libs/runtime/src/b.ts': '1' });
            const plan = await buildPlan({ prodTags: [], prs: false }, deps());
            expect(plan.proposal).toEqual(expect.objectContaining({ unit: 'major', autoUnit: 'minor' }));
            expect(plan.release.version).toBe('0.33.0');
            expect((await buildPlan({ prodTags: [], prs: false, bump: 'major' }, deps())).release.version).toBe(
                '1.0.0'
            );
        } finally {
            run(['reset', '-q', '--hard', head]);
        }
    });

    it('새 의존성은 minor 신호이고 신호를 만든 커밋의 PR을 근거로 든다', async () => {
        const head = run(['rev-parse', 'HEAD']);
        try {
            const sha = commit('chore(mobile): add b', {
                'apps/mobile/package.json': '{"dependencies":{"a":"1","b":"1"}}',
            });
            pulls[sha] = [
                {
                    number: 11,
                    title: 'Add b',
                    user: { login: 'x' },
                    html_url: 'u',
                    merged_at: '2026-11-27',
                    base: { ref: 'develop' },
                },
            ];
            const plan = await buildPlan({ prodTags: [] }, deps());
            expect(plan.signals).toEqual([
                expect.objectContaining({ kind: 'dependency', detail: 'new dependency b', sha, pr: 11 }),
            ]);
            expect(plan.proposal.reasons[0]).toEqual(expect.objectContaining({ pr: 11, why: 'native' }));
        } finally {
            run(['reset', '-q', '--hard', head]);
        }
    });

    it('스토어 최신 번호가 태그보다 크면 그 다음 번호를 쓰고, 직접 준 번호는 그보다 작을 수 없다', async () => {
        const plan = await buildPlan({ prodTags: [], prs: false, storeBuild: 130 }, deps());
        expect(plan.release.build).toBe(131);
        expect(plan.release.buildBasis).toEqual({ tags: null, store: 130, gradle: 99, computed: 131 });
        expect(summarize(plan)).toContain('131 (highest of tags none, gradle 99, store 130, plus one)');
        const manual = await buildPlan({ prodTags: [], prs: false, storeBuild: 50, build: '140' }, deps());
        expect(manual.release.build).toBe(140);
        expect(summarize(manual)).toContain('set by hand (next free 100)');
        await expect(buildPlan({ prodTags: [], prs: false, storeBuild: 130, build: '120' }, deps())).rejects.toThrow(
            'below 131'
        );
    });

    it('prod 릴리스가 있으면 그 태그가 기준 버전이다', async () => {
        run(['tag', '-a', 'mobile-v0.32.6-100', shas.lib, '-m', 'prod']);
        try {
            const plan = await buildPlan({ prodTags: ['mobile-v0.32.6-100'], prs: false }, deps());
            expect(plan.base).toEqual(
                expect.objectContaining({ version: '0.32.6', source: 'prod-release', ref: 'mobile-v0.32.6-100' })
            );
            expect(plan.release.version).toBe('0.32.7');
            await expect(
                buildPlan({ prodTags: ['mobile-v0.32.6-100'], prs: false, version: '0.32.6' }, deps())
            ).rejects.toThrow('must be higher');
        } finally {
            run(['tag', '-d', 'mobile-v0.32.6-100']);
        }
    });

    it('--from · --to 로 범위를 직접 준다', async () => {
        const plan = await buildPlan({ prodTags: [], prs: false, from: shas.web, to: shas.lib }, deps());
        expect(plan.commits.map(c => c.sha)).toEqual([shas.lib]);
    });

    it('머지된 PR 중 develop으로 먼저 머지된 것을 고른다', () => {
        expect(pickPr([{ number: 1, merged_at: null }], 'develop')).toBeNull();
        expect(
            pickPr(
                [
                    { number: 2, merged_at: '2026-01-02', base: { ref: 'develop' }, user: { login: 'a' } },
                    { number: 3, merged_at: '2026-01-01', base: { ref: 'main' }, user: { login: 'a' } },
                ],
                'develop'
            ).number
        ).toBe(2);
    });

    it('태그 하나의 노트를 그 태그를 빼고 다시 만든다', async () => {
        run(['tag', '-a', 'mobile-v0.32.6-100', shas.lib, '-m', 'dev']);
        run(['tag', '-a', 'mobile-v0.32.6-101', shas.app, '-m', 'dev']);
        try {
            const plan = await buildPlan({ prodTags: [], forTag: 'mobile-v0.32.6-101' }, deps());
            expect(plan.release).toEqual(
                expect.objectContaining({ unit: 'patch', version: '0.32.6', build: 101, tag: 'mobile-v0.32.6-101' })
            );
            expect(plan.lastTag).toBe('mobile-v0.32.6-100');
            expect(plan.prs.map(pr => pr.number)).toEqual([8]);
        } finally {
            run(['tag', '-d', 'mobile-v0.32.6-100', 'mobile-v0.32.6-101']);
        }
        expect(unitBetween('0.32.5', '0.33.0')).toBe('minor');
        expect(unitBetween('0.33.0', '0.33.0')).toBe('build');
    });

    it('인자를 읽는다', () => {
        expect(parseArgs(['--json', '--from', 'a', '--bump', 'minor', '--version', ''])).toEqual(
            expect.objectContaining({ json: true, from: 'a', bump: 'minor', version: undefined })
        );
        expect(parseArgs(['--build', '140', '--store-build', '130'])).toEqual(
            expect.objectContaining({ build: '140', storeBuild: 130 })
        );
        expect(() => parseArgs(['--nope'])).toThrow('Unknown argument');
        expect(() => parseArgs(['--from'])).toThrow('needs a value');
    });
});

describe('mobile-release finish', () => {
    const plan = {
        repo: 'o/r',
        to: { sha: 'c0ffee' },
        base: { version: '0.32.5', source: 'build.gradle', ref: 'abc', commit: 'abcdef' },
        lastTag: null,
        proposal: {
            unit: 'minor',
            autoUnit: 'minor',
            reasons: [
                {
                    sha: 's',
                    file: 'apps/mobile/ios/Podfile.lock',
                    detail: 'Podfile.lock changed',
                    pr: 5,
                    why: 'native',
                },
            ],
        },
        release: { unit: 'minor', version: '0.33.0', build: 100, tag: 'mobile-v0.33.0-100' },
        prs: [{ number: 5 }, { number: 6 }],
        teamNotes: '### Features\n\n- x (#5)',
        cardNotes: '### 새 기능\n\n- x (#5)',
    };
    const message = tagMessage({
        version: '0.33.0',
        build: 100,
        env: 'dev',
        results: { ios: 'failed', android: 'uploaded' },
        sha: 'c0ffee',
        storeNotes: 'Fixes.\nMore fixes.',
    });

    it('태그 메시지에 환경·플랫폼별 결과·스토어용 노트를 담고 다시 읽는다', () => {
        expect(message.split('\n')[0]).toBe('DoU Mobile 0.33.0 (100)');
        expect(message).toContain('results: ios=failed, android=uploaded');
        expect(parseTagMessage(message)).toEqual({
            env: 'dev',
            platforms: ['android'],
            requested: ['ios', 'android'],
            results: { ios: 'failed', android: 'uploaded' },
            storeNotes: 'Fixes.\nMore fixes.',
        });
        expect(parseTagMessage('')).toEqual({ env: null, platforms: [], requested: [], results: {}, storeNotes: '' });
    });

    it('results 줄이 없는 태그는 platforms · requested에서 결과를 만든다', () => {
        const old = 'x\n\nenv: dev\nplatforms: ios\nrequested: ios, android\ncommit: c\n\nStore notes:\nN';
        expect(parseTagMessage(old).results).toEqual({ ios: 'uploaded', android: 'failed' });
    });

    it('릴리스 본문은 영어로, 플랫폼별 결과·두 노트·버전 근거·비교 링크를 넣는다', () => {
        const body = releaseBody({
            plan,
            env: 'dev',
            results: { ios: 'incomplete', android: 'uploaded' },
            actor: '@me',
            runUrl: 'R',
            uploadedAt: 'T',
            storeNotes: 'Fixes.',
            teamNotes: '',
        });
        expect(body).toContain('| Env | Uploaded | iOS | Android | By | Run |');
        expect(body).toContain(
            '| dev | T | uploaded, lane failed after the upload (check the store notes) | uploaded | @me | [run](R) |'
        );
        expect(body).toContain('### Features');
        expect(body).toContain('## Store notes\n\nFixes.');
        expect(body).toContain('minor (as proposed) — Podfile.lock changed (apps/mobile/ios/Podfile.lock), PR #5');
        expect(body).toContain('https://github.com/o/r/compare/abcdef...mobile-v0.33.0-100');
    });

    it('PR 댓글은 영어이고 중복을 막는 표시를 넣는다', () => {
        expect(prComment({ plan, env: 'dev', releaseUrl: 'U' })).toBe(
            `${marker(plan.release.tag, 'dev')}\nShipped in dev 0.33.0 (100) · U`
        );
    });

    const fakeDeps = ({ tagSha = 'c0ffee', existingRelease = false, comments = {} } = {}) => {
        const calls = [];
        return {
            calls,
            deps: {
                git: args =>
                    args[2] === '--format=%(contents)' ? message : args[2] && args[2].includes('taggerdate') ? 'T' : '',
                tryGit: () => tagSha,
                gh: async args => {
                    calls.push(args);
                    if (args[0] === 'release' && args[1] === 'view' && !args.includes('--jq') && !existingRelease) {
                        throw new Error('none');
                    }
                    if (args[0] === 'release' && args[1] === 'view') return 'https://rel\n';
                    if (args[0] === 'api' && args[1] === '--paginate') {
                        return comments[/issues\/(\d+)/.exec(args[2])[1]] || '';
                    }
                    return '';
                },
                plan: async () => plan,
                writeFile: () => undefined,
                log: () => undefined,
            },
        };
    };
    const options = { tag: 'mobile-v0.33.0-100', bodyFile: 'b' };

    it('태그 메시지의 노트로 Latest가 아닌 pre-release를 만들고 PR마다 한 번 댓글을 단다', async () => {
        const { calls, deps } = fakeDeps({ comments: { 6: `${marker(plan.release.tag, 'dev')}\nold` } });
        const result = await finish(options, deps);
        expect(result.body).toContain('## Store notes\n\nFixes.\nMore fixes.');
        expect(result.results).toEqual({ ios: 'failed', android: 'uploaded' });
        expect(result.cardNotes).toBe(plan.cardNotes);
        const create = calls.find(call => call[0] === 'release' && call[1] === 'create');
        expect(create).toEqual(expect.arrayContaining(['--prerelease', '--latest=false', '--verify-tag']));
        const posts = calls.filter(call => call.includes('POST'));
        expect(posts).toHaveLength(1);
        expect(posts[0][3]).toBe('repos/o/r/issues/5/comments');
        expect(result).toEqual(expect.objectContaining({ url: 'https://rel', commented: [5] }));
    });

    it('다시 돌리면 릴리스를 만들지 않고 고치고, 받은 플랫폼별 결과를 쓴다', async () => {
        const { calls, deps } = fakeDeps({ existingRelease: true });
        const result = await finish(
            {
                ...options,
                storeNotes: 'Other.',
                teamNotes: 'Hand-written notes',
                platforms: 'ios=uploaded,android=uploaded',
            },
            deps
        );
        expect(calls.some(call => call[1] === 'create')).toBe(false);
        expect(calls.find(call => call[1] === 'edit')).toEqual(
            expect.arrayContaining(['--latest=false', '--prerelease'])
        );
        expect(result.results).toEqual({ ios: 'uploaded', android: 'uploaded' });
        expect(result.cardNotes).toBe('Hand-written notes');
    });

    it('태그가 없거나 이름이 틀리거나 prod거나 올라간 플랫폼이 없으면 실패한다', async () => {
        await expect(finish(options, fakeDeps({ tagSha: null }).deps)).rejects.toThrow('does not exist');
        await expect(finish({ ...options, tag: 'v1.0.0' }, fakeDeps().deps)).rejects.toThrow('not a mobile-v');
        await expect(finish({ ...options, env: 'prod' }, fakeDeps().deps)).rejects.toThrow('env=dev only');
        await expect(finish({ ...options, platforms: 'ios=failed' }, fakeDeps().deps)).rejects.toThrow(
            'no uploaded platform'
        );
    });
});

describe('mobile-release store', () => {
    const storeDeps = ({ status = 0, value = '120', calls = [] } = {}) => ({
        root: '/repo',
        tmpdir: () => '/tmp',
        read: () => value,
        remove: () => undefined,
        run: (command, args, env, cwd) => {
            calls.push([command, ...args, cwd]);
            return status;
        },
        warn: () => undefined,
    });

    it('fastlane latest_build 레인으로 스토어 최신 번호를 읽는다', () => {
        const calls = [];
        expect(store.readStoreBuild('android', 'dev', storeDeps({ calls }))).toBe(120);
        expect(calls[0].slice(0, 4)).toEqual(['fastlane', 'android', 'latest_build', 'env:dev']);
        expect(calls[0][calls[0].length - 1]).toBe('/repo/apps/mobile');
        expect(store.storeFloor(['ios', 'android'], 'dev', storeDeps())).toEqual({
            byPlatform: { ios: 120, android: 120 },
            max: 120,
        });
    });

    it('스토어 번호를 읽지 못하면 멈춘다', () => {
        expect(() => store.readStoreBuild('ios', 'dev', storeDeps({ status: 1 }))).toThrow('stopping');
        expect(() => store.readStoreBuild('ios', 'dev', storeDeps({ value: 'nope' }))).toThrow('stopping');
    });

    it('레인이 실패해도 스토어에 그 번호가 있으면 올라간 것으로 본다', () => {
        const results = store.resolveResults(
            { requested: ['ios', 'android'], outcomes: { ios: 'failure' }, env: 'dev', build: 120 },
            storeDeps({ value: '120' })
        );
        expect(results).toEqual({ ios: 'incomplete', android: 'skipped' });
        expect(
            store.resolveResults(
                { requested: ['ios'], outcomes: { ios: 'failure' }, env: 'dev', build: 121 },
                storeDeps({ value: '120' })
            )
        ).toEqual({ ios: 'failed' });
        expect(
            store.resolveResults(
                { requested: ['ios'], outcomes: { ios: 'failure' }, env: 'dev', build: 121 },
                storeDeps({ status: 1 })
            )
        ).toEqual({ ios: 'failed' });
    });

    it('결과를 읽고 쓰고, 다시 올린 결과를 합친다', () => {
        expect(store.parseResults('ios,android')).toEqual({ ios: 'uploaded', android: 'uploaded' });
        expect(store.parseResults('ios=incomplete; android=failed')).toEqual({ ios: 'incomplete', android: 'failed' });
        expect(() => store.parseResults('ios=done')).toThrow('Unknown upload result');
        expect(store.formatResults({ ios: 'uploaded', android: 'failed' })).toBe('ios=uploaded, android=failed');
        expect(store.uploadedPlatforms({ ios: 'incomplete', android: 'failed', web: 'uploaded' })).toEqual([
            'ios',
            'web',
        ]);
        expect(
            store.mergeResults({ ios: 'uploaded', android: 'failed' }, { android: 'uploaded', ios: 'failed' })
        ).toEqual({ ios: 'uploaded', android: 'uploaded' });
    });
});

describe('mobile-release local release', () => {
    let root;
    beforeAll(() => {
        root = fs.mkdtempSync(path.join(os.tmpdir(), 'mobile-release-keys-'));
    });
    afterAll(() => fs.rmSync(root, { recursive: true, force: true }));

    it('이번 실행에 필요한 배포 키만 본다', () => {
        expect(release.missingKeys(root, 'dev', ['ios'])).toEqual([
            'apps/mobile/fastlane/.env',
            'apps/mobile/fastlane/AuthKey_*.p8',
        ]);
        expect(release.missingKeys(root, 'dev', ['android'])).toEqual([
            'apps/mobile/fastlane/.env',
            'apps/mobile/fastlane/play-service-account-dev.json',
            'apps/mobile/android/app/chatic-dou.keystore',
        ]);
        expect(release.missingKeys(root, 'prod', ['android'])).toContain(
            'apps/mobile/fastlane/play-service-account-prod.json'
        );
        for (const file of [
            'apps/mobile/fastlane/.env',
            'apps/mobile/fastlane/play-service-account-dev.json',
            'apps/mobile/android/app/chatic-dou.keystore',
        ]) {
            fs.mkdirSync(path.dirname(path.join(root, file)), { recursive: true });
            fs.writeFileSync(path.join(root, file), 'placeholder');
        }
        expect(release.missingKeys(root, 'dev', ['android'])).toEqual([]);
        expect(release.missingKeys(root, 'dev', ['ios', 'android'])).toEqual(['apps/mobile/fastlane/AuthKey_*.p8']);
        fs.writeFileSync(path.join(root, 'apps/mobile/fastlane/AuthKey_ABC123.p8'), 'placeholder');
        expect(release.missingKeys(root, 'dev', ['ios', 'android'])).toEqual([]);
    });

    it('플랫폼은 iOS 먼저다', () => {
        expect(release.platformsFor('all')).toEqual(['ios', 'android']);
        expect(release.platformsFor(undefined)).toEqual(['ios', 'android']);
        expect(release.platformsFor('android')).toEqual(['android']);
        expect(() => release.platformsFor('web')).toThrow('platform must be');
    });

    it('인자를 읽는다', () => {
        expect(release.parseArgs(['dev', 'android', '--notes', 'x', '--dry-run', '--build', '140'])).toEqual(
            expect.objectContaining({
                command: 'dev',
                platform: 'android',
                storeNotes: 'x',
                dryRun: true,
                build: '140',
            })
        );
        expect(release.parseArgs(['finish', 'mobile-v0.33.0-100']).tag).toBe('mobile-v0.33.0-100');
        expect(release.parseArgs(['dev', '--tag', 'mobile-v0.33.0-100']).tag).toBe('mobile-v0.33.0-100');
        expect(() => release.parseArgs(['dev', '--nope'])).toThrow('Unknown argument');
    });

    const fakePlan = { to: { sha: 'c0ffee00' }, release: { version: '0.33.0', build: 100, tag: 'mobile-v0.33.0-100' } };
    const localDeps = ({
        branch = 'develop',
        dirty = '',
        runStatus = [0, 0],
        activeRuns = [],
        tagExists = false,
        tagsAfter = [],
        storeBuild = '99',
        storeStatus = 0,
        head = 'c0ffee00',
        existingTag = null,
    } = {}) => {
        const calls = [];
        const plans = [];
        const statuses = [...runStatus];
        return {
            calls,
            plans,
            deps: {
                root,
                git: args => {
                    calls.push(['git', ...args]);
                    if (args[0] === 'rev-parse' && args[1] === '--abbrev-ref') return branch;
                    if (args[0] === 'status') return dirty;
                    if (args[0] === 'rev-parse' && args[1] === 'HEAD') return head;
                    if (args[0] === 'rev-parse') return 'c0ffee00';
                    if (args[0] === 'tag' && args[2] === '--format=%(contents)') return existingTag.message;
                    if (args[0] === 'tag' && args[1] === '-l') {
                        return calls.some(call => call[0] === 'run') ? tagsAfter.join('\n') : '';
                    }
                    return '';
                },
                tryGit: args => {
                    if (args[0] === 'rev-list') return existingTag ? existingTag.sha : null;
                    return tagExists ? 'x' : null;
                },
                gh: async args => {
                    calls.push(['gh', ...args]);
                    if (args[0] === 'run') return JSON.stringify(activeRuns);
                    return '';
                },
                exists: () => false,
                hasCommand: () => true,
                run: (command, args, env) => {
                    calls.push(['run', command, ...args, env]);
                    return statuses.shift();
                },
                plan: async options => {
                    plans.push(options);
                    return fakePlan;
                },
                summarize: () => 'summary',
                log: () => undefined,
                store: {
                    root: '/repo',
                    tmpdir: () => '/tmp',
                    read: () => storeBuild,
                    remove: () => undefined,
                    run: (command, args) => {
                        calls.push(['store', ...args]);
                        return storeStatus;
                    },
                    warn: () => undefined,
                },
            },
        };
    };

    it('--dry-run은 스토어를 읽지 않고 업로드·태그 없이 할 일만 보여 준다', async () => {
        const { calls, deps } = localDeps();
        const logs = [];
        deps.log = line => logs.push(line);
        const result = await release.releaseDev({ platform: 'android', storeNotes: 'Fixes.', dryRun: true }, deps);
        expect(result.dryRun).toBe(true);
        expect(calls.some(call => call[0] === 'run' || call[0] === 'store')).toBe(false);
        expect(calls.some(call => call[1] === 'tag' || call[1] === 'push')).toBe(false);
        expect(logs.join('\n')).toContain('(cd apps/mobile && fastlane android latest_build env:dev out:<file>)');
    });

    it('사전 점검이 실패하면 스토어를 읽거나 올리기 전에 멈춘다', async () => {
        for (const [setup, name] of [
            [{ branch: 'feat/x' }, 'branch'],
            [{ dirty: ' M a' }, 'clean tree'],
            [{ activeRuns: [{ status: 'in_progress', url: 'u' }] }, 'no remote run'],
            [{ tagExists: true }, 'already exists'],
        ]) {
            const { calls, deps } = localDeps(setup);
            await expect(release.releaseDev({ platform: 'android', storeNotes: 'Fixes.' }, deps)).rejects.toThrow(name);
            expect(calls.some(call => call[0] === 'run')).toBe(false);
        }
        const { deps } = localDeps();
        await expect(release.releaseDev({ platform: 'android', storeNotes: 'a'.repeat(501) }, deps)).rejects.toThrow(
            'store notes'
        );
    });

    it('스토어 번호를 읽지 못하면 올리지 않는다', async () => {
        const { calls, deps } = localDeps({ storeStatus: 1 });
        await expect(release.releaseDev({ platform: 'android', storeNotes: 'Fixes.' }, deps)).rejects.toThrow(
            'Could not read the latest android dev build number'
        );
        expect(calls.some(call => call[0] === 'run')).toBe(false);
    });

    it('스토어 번호를 바닥값으로 넘기고, 올린 뒤 태그를 push하고 마무리 워크플로를 부른다', async () => {
        const { calls, plans, deps } = localDeps({ storeBuild: '120' });
        await release.releaseDev({ platform: 'all', storeNotes: 'Fixes.', build: '130' }, deps);
        expect(plans[0]).toEqual(expect.objectContaining({ storeBuild: 120, build: '130' }));
        expect(calls.filter(call => call[0] === 'store').map(call => call[1])).toEqual(['ios', 'android']);
        const runs = calls.filter(call => call[0] === 'run');
        expect(runs.map(call => call[2])).toEqual(['ios', 'android']);
        expect(runs[0][runs[0].length - 1]).toEqual({ VERSION_NAME: '0.33.0', BUILD_NUMBER: '100' });
        const tag = calls.find(call => call[1] === 'tag' && call[2] === '-a');
        expect(tag.slice(0, 6)).toEqual(['git', 'tag', '-a', '--cleanup=verbatim', 'mobile-v0.33.0-100', 'c0ffee00']);
        expect(parseTagMessage(tag[7])).toEqual({
            env: 'dev',
            platforms: ['ios', 'android'],
            requested: ['ios', 'android'],
            results: { ios: 'uploaded', android: 'uploaded' },
            storeNotes: 'Fixes.',
        });
        expect(calls).toContainEqual(['git', 'push', 'origin', 'refs/tags/mobile-v0.33.0-100']);
        expect(calls.find(call => call[1] === 'workflow')).toEqual([
            'gh',
            'workflow',
            'run',
            'mobile-release-finish.yml',
            '--ref',
            'develop',
            '-f',
            'tag=mobile-v0.33.0-100',
        ]);
    });

    it('첫 플랫폼이 실패하고 스토어에도 없으면 다음을 올리지 않고 태그도 없다', async () => {
        const { calls, deps } = localDeps({ runStatus: [1] });
        await expect(release.releaseDev({ platform: 'all', storeNotes: 'Fixes.' }, deps)).rejects.toThrow(
            'no tag was made'
        );
        expect(calls.filter(call => call[0] === 'run')).toHaveLength(1);
        expect(calls.some(call => call[1] === 'tag' && call[2] === '-a')).toBe(false);
    });

    it('레인이 실패했어도 바이너리가 스토어에 있으면 태그를 달고 incomplete로 적는다', async () => {
        const { calls, deps } = localDeps({ runStatus: [1], storeBuild: '99' });
        deps.store.read = () => (calls.some(call => call[0] === 'run') ? '100' : '99');
        await expect(release.releaseDev({ platform: 'all', storeNotes: 'Fixes.' }, deps)).rejects.toThrow(
            'ios reached the store but its lane failed'
        );
        const tag = calls.find(call => call[1] === 'tag' && call[2] === '-a');
        expect(parseTagMessage(tag[7]).results).toEqual({ ios: 'incomplete', android: 'skipped' });
    });

    it('둘째 플랫폼이 실패해도 올라간 플랫폼으로 태그를 남겨 빌드 번호를 다시 쓰지 않는다', async () => {
        const { calls, deps } = localDeps({ runStatus: [0, 1] });
        await expect(release.releaseDev({ platform: 'all', storeNotes: 'Fixes.' }, deps)).rejects.toThrow(
            'android upload failed'
        );
        const tag = calls.find(call => call[1] === 'tag' && call[2] === '-a');
        expect(parseTagMessage(tag[7])).toEqual(
            expect.objectContaining({ platforms: ['ios'], results: { ios: 'uploaded', android: 'failed' } })
        );
    });

    it('다른 실행이 같은 빌드 번호의 태그를 먼저 달면 태그를 달지 않는다', async () => {
        const { calls, deps } = localDeps({ tagsAfter: ['mobile-v0.33.0-100'] });
        await expect(release.releaseDev({ platform: 'all', storeNotes: 'Fixes.' }, deps)).rejects.toThrow(
            'not tagging'
        );
        expect(calls.filter(call => call[0] === 'run')).toHaveLength(1);
        expect(calls.some(call => call[1] === 'tag' && call[2] === '-a')).toBe(false);
    });

    const taggedPartial = {
        sha: 'feed0000',
        message: tagMessage({
            version: '0.33.0',
            build: 100,
            env: 'dev',
            results: { ios: 'uploaded', android: 'failed' },
            sha: 'feed0000',
            storeNotes: 'Tagged notes.',
        }),
    };

    it('dev --tag는 그 태그 커밋에서 빠진 플랫폼만 같은 번호로 올리고 태그는 옮기지 않는다', async () => {
        const { calls, plans, deps } = localDeps({ existingTag: taggedPartial, head: 'feed0000' });
        const result = await release.releaseDev({ tag: 'mobile-v0.33.0-100' }, deps);
        expect(plans).toHaveLength(0);
        expect(calls.some(call => call[0] === 'store')).toBe(false);
        const runs = calls.filter(call => call[0] === 'run');
        expect(runs.map(call => call[2])).toEqual(['android']);
        expect(runs[0]).toContain('Tagged notes.');
        expect(runs[0][runs[0].length - 1]).toEqual({ VERSION_NAME: '0.33.0', BUILD_NUMBER: '100' });
        expect(calls.some(call => call[1] === 'tag' && call[2] === '-a')).toBe(false);
        expect(calls.some(call => call[1] === 'push')).toBe(false);
        expect(calls.find(call => call[1] === 'workflow')).toEqual(
            expect.arrayContaining(['tag=mobile-v0.33.0-100', 'platform=ios=uploaded, android=uploaded'])
        );
        expect(result.results).toEqual({ android: 'uploaded' });
    });

    it('dev --tag는 태그 커밋에 있지 않거나 빠진 플랫폼이 없으면 멈춘다', async () => {
        const away = localDeps({ existingTag: taggedPartial, head: 'c0ffee00' });
        await expect(release.releaseDev({ tag: 'mobile-v0.33.0-100' }, away.deps)).rejects.toThrow('at the tag');
        const done = localDeps({
            existingTag: {
                ...taggedPartial,
                message: taggedPartial.message.replace('android=failed', 'android=incomplete'),
            },
            head: 'feed0000',
        });
        await expect(release.releaseDev({ tag: 'mobile-v0.33.0-100' }, done.deps)).rejects.toThrow('nothing to retry');
        const dry = localDeps({ existingTag: taggedPartial, head: 'feed0000' });
        expect((await release.releaseDev({ tag: 'mobile-v0.33.0-100', dryRun: true }, dry.deps)).dryRun).toBe(true);
        expect(dry.calls.some(call => call[0] === 'run')).toBe(false);
    });

    it('prod는 아직 거부한다', async () => {
        await expect(release.run(['prod'], localDeps().deps)).rejects.toThrow('release branches');
    });
});

describe('mobile-release ios-version', () => {
    const app = '\t\tCURRENT_PROJECT_VERSION = 99;\n\t\tMARKETING_VERSION = 0.32.5;\n';
    const ext = '\t\tCURRENT_PROJECT_VERSION = 1;\n\t\tMARKETING_VERSION = 1.0;\n';
    const gradleText = 'versionCode 99\nversionName "0.32.5"\n';

    it('앱 타깃의 버전만 바꾸고 알림 확장은 그대로 둔다', () => {
        const out = injectIosVersion(app.repeat(4) + ext.repeat(2), gradleText, {
            versionName: '0.33.0',
            versionCode: '100',
        });
        expect(out.match(/MARKETING_VERSION = 0\.33\.0;/g)).toHaveLength(4);
        expect(out.match(/CURRENT_PROJECT_VERSION = 100;/g)).toHaveLength(4);
        expect(out.match(/MARKETING_VERSION = 1\.0;/g)).toHaveLength(2);
    });

    it('잘못된 값은 거부한다', () => {
        expect(() => injectIosVersion(app, gradleText, { versionName: '0.33', versionCode: '100' })).toThrow('X.Y.Z');
        expect(() => injectIosVersion(app, gradleText, { versionName: '0.33.0', versionCode: 'x' })).toThrow('number');
    });
});
