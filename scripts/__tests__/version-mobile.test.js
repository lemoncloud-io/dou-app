const fs = require('fs');
const os = require('os');
const path = require('path');

const { readGradleVersion, bumpSemver, updateGradle, updatePbxproj, run, CONFIG } = require('../version-mobile');

// Minimal build.gradle fixture mirroring apps/mobile/android/app/build.gradle.
const GRADLE_FIXTURE = `android {
    defaultConfig {
        applicationId "io.chatic.dou"
        versionCode 63
        versionName "0.19.0"
    }
}
`;

// pbxproj fixture: 4 app-target entries (like the real project) plus
// notification-extension entries pinned at 1.0/1 that must never move.
const APP_ENTRY = '\t\t\t\tCURRENT_PROJECT_VERSION = 63;\n\t\t\t\tMARKETING_VERSION = 0.19.0;\n';
const EXT_ENTRY = '\t\t\t\tCURRENT_PROJECT_VERSION = 1;\n\t\t\t\tMARKETING_VERSION = 1.0;\n';
const PBX_FIXTURE = APP_ENTRY.repeat(4) + EXT_ENTRY.repeat(4);

describe('version-mobile', () => {
    describe('bumpSemver', () => {
        it('patch는 세 번째 자리만 올린다', () => {
            expect(bumpSemver('0.19.0', 'patch')).toBe('0.19.1');
        });

        it('minor는 두 번째 자리를 올리고 patch를 0으로 리셋한다', () => {
            expect(bumpSemver('0.19.3', 'minor')).toBe('0.20.0');
        });

        it('major는 첫 자리를 올리고 나머지를 0으로 리셋한다', () => {
            expect(bumpSemver('0.19.3', 'major')).toBe('1.0.0');
        });

        it('build는 마케팅 버전을 그대로 둔다', () => {
            expect(bumpSemver('0.19.0', 'build')).toBe('0.19.0');
        });

        it('알 수 없는 타입은 에러를 던진다', () => {
            expect(() => bumpSemver('0.19.0', 'nope')).toThrow('Unknown bump type');
        });
    });

    describe('readGradleVersion', () => {
        it('build.gradle에서 versionName과 versionCode를 읽는다', () => {
            expect(readGradleVersion(GRADLE_FIXTURE)).toEqual({ versionName: '0.19.0', versionCode: 63 });
        });

        it('버전 필드가 없으면 에러를 던진다', () => {
            expect(() => readGradleVersion('android {}')).toThrow('Cannot find versionName/versionCode');
        });
    });

    describe('updateGradle', () => {
        it('versionCode와 versionName을 함께 갱신한다', () => {
            const next = updateGradle(
                GRADLE_FIXTURE,
                { versionName: '0.19.0', versionCode: 63 },
                { versionName: '0.19.1', versionCode: 64 }
            );
            expect(next).toContain('versionCode 64');
            expect(next).toContain('versionName "0.19.1"');
            expect(next).not.toContain('versionCode 63');
            expect(next).not.toContain('"0.19.0"');
        });
    });

    describe('updatePbxproj', () => {
        const current = { versionName: '0.19.0', versionCode: 63 };
        const next = { versionName: '0.19.1', versionCode: 64 };

        it('앱 타깃 4곳의 버전을 모두 갱신한다', () => {
            const result = updatePbxproj(PBX_FIXTURE, current, next);
            expect(result.match(/MARKETING_VERSION = 0\.19\.1;/g)).toHaveLength(4);
            expect(result.match(/CURRENT_PROJECT_VERSION = 64;/g)).toHaveLength(4);
        });

        it('노티피케이션 익스텐션 타깃(1.0/1)은 건드리지 않는다', () => {
            const result = updatePbxproj(PBX_FIXTURE, current, next);
            expect(result.match(/MARKETING_VERSION = 1\.0;/g)).toHaveLength(4);
            expect(result.match(/CURRENT_PROJECT_VERSION = 1;/g)).toHaveLength(4);
        });

        it('iOS와 Android 버전이 어긋나 있으면 에러를 던진다', () => {
            // Simulate iOS still sitting at the previous release entirely.
            expect(() => updatePbxproj(PBX_FIXTURE, { versionName: '0.18.0', versionCode: 62 }, next)).toThrow(
                'out of sync'
            );
        });

        it('두 필드의 매치 수가 다르면(반쯤 수정된 상태) 에러를 던진다', () => {
            // One MARKETING_VERSION line was already hand-edited to the next
            // version, so field counts no longer agree.
            const halfEdited = PBX_FIXTURE.replace('MARKETING_VERSION = 0.19.0;', 'MARKETING_VERSION = 0.19.1;');
            expect(() => updatePbxproj(halfEdited, current, next)).toThrow('out of sync');
        });
    });

    describe('run (--no-commit)', () => {
        let tmpDir;

        beforeEach(() => {
            // Recreate the expected repo layout inside a temp dir so run()
            // exercises real file IO without touching the working tree.
            tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'version-mobile-'));
            const gradleFile = path.join(tmpDir, CONFIG.gradlePath);
            const pbxFile = path.join(tmpDir, CONFIG.pbxprojPath);
            fs.mkdirSync(path.dirname(gradleFile), { recursive: true });
            fs.mkdirSync(path.dirname(pbxFile), { recursive: true });
            fs.writeFileSync(gradleFile, GRADLE_FIXTURE);
            fs.writeFileSync(pbxFile, PBX_FIXTURE);
        });

        afterEach(() => {
            fs.rmSync(tmpDir, { recursive: true, force: true });
        });

        it('patch 범프가 양 플랫폼 파일을 함께 갱신한다', () => {
            const next = run(['patch', '--no-commit'], tmpDir);

            expect(next).toEqual({ versionName: '0.19.1', versionCode: 64 });
            const gradle = fs.readFileSync(path.join(tmpDir, CONFIG.gradlePath), 'utf8');
            const pbx = fs.readFileSync(path.join(tmpDir, CONFIG.pbxprojPath), 'utf8');
            expect(gradle).toContain('versionName "0.19.1"');
            expect(gradle).toContain('versionCode 64');
            expect(pbx.match(/MARKETING_VERSION = 0\.19\.1;/g)).toHaveLength(4);
            expect(pbx.match(/CURRENT_PROJECT_VERSION = 64;/g)).toHaveLength(4);
        });

        it('build 범프는 빌드번호만 올리고 마케팅 버전을 유지한다', () => {
            const next = run(['build', '--no-commit'], tmpDir);

            expect(next).toEqual({ versionName: '0.19.0', versionCode: 64 });
            const gradle = fs.readFileSync(path.join(tmpDir, CONFIG.gradlePath), 'utf8');
            expect(gradle).toContain('versionName "0.19.0"');
            expect(gradle).toContain('versionCode 64');
        });

        it('iOS가 어긋난 상태면 어떤 파일도 수정하지 않는다', () => {
            // Corrupt the pbxproj (unequal field counts) so validation fails
            // before any write happens.
            const pbxFile = path.join(tmpDir, CONFIG.pbxprojPath);
            fs.writeFileSync(
                pbxFile,
                PBX_FIXTURE.replace('MARKETING_VERSION = 0.19.0;', 'MARKETING_VERSION = 0.19.1;')
            );

            expect(() => run(['patch', '--no-commit'], tmpDir)).toThrow('out of sync');
            const gradle = fs.readFileSync(path.join(tmpDir, CONFIG.gradlePath), 'utf8');
            expect(gradle).toContain('versionCode 63');
        });
    });
});
