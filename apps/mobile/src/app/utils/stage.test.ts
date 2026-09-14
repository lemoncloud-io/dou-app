import { toEnvStage } from './stage';

describe('toEnvStage (VITE_ENV → Env 어휘 변환)', () => {
    it.each([
        ['LOCAL', 'local'],
        ['DEV', 'stage'],
        ['PROD', 'prod'],
    ] as const)('%s를 %s로 옮긴다', (raw, expected) => {
        expect(toEnvStage(raw)).toBe(expected);
    });

    // The old injection was `Config.VITE_ENV || 'PROD'`: a build that failed to load its env file
    // presented itself as prod. Keep that polarity — never let a missing value read as a lower
    // environment, since the value ends up in the push application name.
    it.each([undefined, '', '   ', 'STAGING'])('알 수 없는 값 %p은 prod로 떨어진다', raw => {
        expect(toEnvStage(raw)).toBe('prod');
    });

    it('소문자로 들어와도 받는다 — VITE_ENV는 대문자지만 값의 출처가 env 파일이라 대비한다', () => {
        expect(toEnvStage('dev')).toBe('stage');
        expect(toEnvStage('local')).toBe('local');
    });
});
