import { describe, expect, it } from 'vitest';

import { decodeSegment, mapMatchesStack, readBundleNames, resolveStack } from './resolveStack';

// Hand-built so the expected positions are derivable by reading the mappings
// rather than by trusting a generator:
//   line 1, "AAAA"  -> generated col 0 = source 0, line 0, col 0 (no name)
//   line 1, "SAASA" -> +9 cols = generated col 9, same source/line, col 9, name 0
const MAP = {
    sources: ['../../apps/web/src/app/hooks/useMyProfile.ts'],
    names: ['getMyProfile'],
    mappings: 'AAAA,SAASA',
};

describe('decodeSegment', () => {
    it('base64-VLQ 세그먼트를 숫자로 푼다', () => {
        expect(decodeSegment('AAAA')).toEqual([0, 0, 0, 0]);
        expect(decodeSegment('SAASA')).toEqual([9, 0, 0, 9, 0]);
    });

    it('부호 비트와 연속 비트를 처리한다', () => {
        expect(decodeSegment('D')).toEqual([-1]);
        expect(decodeSegment('gB')).toEqual([16]);
    });
});

describe('resolveStack', () => {
    it('Safari 프레임을 원본 위치와 심볼로 바꾼다', () => {
        expect(resolveStack(MAP, 'x@https://dou-dev.chatic.io/assets/index-abc.js:1:9')).toBe(
            'getMyProfile (apps/web/src/app/hooks/useMyProfile.ts:1:9)'
        );
    });

    it('Chrome 프레임도 처리한다', () => {
        expect(resolveStack(MAP, '    at x (https://x/index-abc.js:1:9)')).toContain(
            'getMyProfile (apps/web/src/app/hooks/useMyProfile.ts:1:9)'
        );
    });

    it('매핑에 이름이 없으면 원래 프레임 이름을 유지한다', () => {
        expect(resolveStack(MAP, 'minified@https://x/index-abc.js:1:2')).toBe(
            'minified (apps/web/src/app/hooks/useMyProfile.ts:1:0)'
        );
    });

    it('못 푸는 프레임은 원문 그대로 둔다 — 일부만 풀려도 나머지를 잃지 않는다', () => {
        const stack = ['a@https://x/index-abc.js:1:9', 'b@https://x/index-abc.js:99:1', 'Promise@[native code]'].join(
            '\n'
        );

        expect(resolveStack(MAP, stack).split('\n')).toEqual([
            'getMyProfile (apps/web/src/app/hooks/useMyProfile.ts:1:9)',
            'b@https://x/index-abc.js:99:1',
            'Promise@[native code]',
        ]);
    });
});

describe('readBundleNames', () => {
    it('스택이 가리키는 번들 파일명을 중복 없이 뽑는다', () => {
        const stack = ['a@https://x/assets/index-abc.js:1:1', 'b@https://x/assets/index-abc.js:2:2'].join('\n');

        expect(readBundleNames(stack)).toEqual(['index-abc.js']);
    });

    it('네이티브 프레임만 있으면 빈 배열', () => {
        expect(readBundleNames('Promise@[native code]')).toEqual([]);
    });
});

// 빌드가 다르면 열 좌표가 어긋나 조용히 엉뚱한 줄로 풀린다. 이름 대조가 그 유일한 방어다.
describe('mapMatchesStack', () => {
    const stack = 'a@https://x/assets/index-abc.js:1:1';

    it('번들 이름이 맞으면 통과', () => {
        expect(mapMatchesStack('index-abc.js.map', stack)).toBe(true);
    });

    it('다른 빌드의 맵은 걸러낸다', () => {
        expect(mapMatchesStack('index-zzz.js.map', stack)).toBe(false);
    });

    it('대조할 번들이 없으면 막지 않는다', () => {
        expect(mapMatchesStack('index-abc.js.map', 'Promise@[native code]')).toBe(true);
    });
});
