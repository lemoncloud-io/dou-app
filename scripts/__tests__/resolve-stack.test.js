const { decodeSegment, buildIndex, findSegment, readBundleNames, resolveStack } = require('../resolve-stack');

// Hand-built map so the expected positions are derivable by reading the
// mappings rather than by trusting a generator:
//   line 1, "AAAA"  -> generated col 0 = source 0, line 0, col 0 (no name)
//   line 1, "SAASA" -> +9 cols = generated col 9, same source/line, col 9, name 0
//   line 2, "AAAA"  -> generated col 0 = source 0, line 0 (deltas continue), col 9
const MAP = {
    version: 3,
    sources: ['../../apps/web/src/app/hooks/useMyProfile.ts'],
    names: ['getMyProfile'],
    mappings: 'AAAA,SAASA;AAAA',
};

describe('resolve-stack', () => {
    describe('decodeSegment', () => {
        it('base64-VLQ 한 세그먼트를 숫자 배열로 푼다', () => {
            expect(decodeSegment('AAAA')).toEqual([0, 0, 0, 0]);
            // 'S' = 18 -> sign bit 0, magnitude 9.
            expect(decodeSegment('SAASA')).toEqual([9, 0, 0, 9, 0]);
        });

        it('부호 비트가 켜지면 음수로 푼다', () => {
            // 'D' = 3 -> sign bit 1, magnitude 1.
            expect(decodeSegment('D')).toEqual([-1]);
        });

        it('연속 비트가 붙은 여러 자리 수를 이어 붙인다', () => {
            // 'g' = 32 (continuation) + 'B' = 1 -> (1 << 5) = 32 -> magnitude 16.
            expect(decodeSegment('gB')).toEqual([16]);
        });
    });

    describe('buildIndex', () => {
        it('생성 열은 행마다 리셋되고 나머지 필드는 파일 전체에 걸쳐 누적된다', () => {
            const index = buildIndex(MAP.mappings);

            expect(index).toHaveLength(2);
            expect(index[0]).toEqual([
                { generatedColumn: 0, sourceIndex: 0, sourceLine: 0, sourceColumn: 0, nameIndex: undefined },
                { generatedColumn: 9, sourceIndex: 0, sourceLine: 0, sourceColumn: 9, nameIndex: 0 },
            ]);
            // 2행의 첫 세그먼트: 생성 열은 0으로 리셋, sourceColumn 은 9에서 이어진다.
            expect(index[1][0]).toMatchObject({ generatedColumn: 0, sourceColumn: 9 });
        });
    });

    describe('findSegment', () => {
        const segments = [{ generatedColumn: 0 }, { generatedColumn: 9 }, { generatedColumn: 20 }];

        it('열을 포함하는 세그먼트는 그 열 이하에서 가장 마지막 것이다', () => {
            expect(findSegment(segments, 0)).toBe(segments[0]);
            expect(findSegment(segments, 8)).toBe(segments[0]);
            expect(findSegment(segments, 9)).toBe(segments[1]);
            expect(findSegment(segments, 999)).toBe(segments[2]);
        });

        it('첫 세그먼트보다 앞선 열은 매칭되지 않는다', () => {
            expect(findSegment([{ generatedColumn: 5 }], 1)).toBeUndefined();
        });
    });

    describe('resolveStack', () => {
        it('Safari 형식 프레임을 원본 위치와 심볼로 바꾼다', () => {
            const out = resolveStack(MAP, 'x@https://dou-dev.chatic.io/assets/index-abc.js:1:9');

            expect(out).toBe('getMyProfile (apps/web/src/app/hooks/useMyProfile.ts:1:9)');
        });

        it('Chrome 형식 프레임도 처리한다', () => {
            const out = resolveStack(MAP, '    at x (https://dou-dev.chatic.io/assets/index-abc.js:1:9)');

            expect(out).toContain('getMyProfile (apps/web/src/app/hooks/useMyProfile.ts:1:9)');
        });

        it('매핑에 이름이 없으면 원래 프레임 이름을 유지한다', () => {
            const out = resolveStack(MAP, 'someMinifiedName@https://x/index-abc.js:1:2');

            expect(out).toBe('someMinifiedName (apps/web/src/app/hooks/useMyProfile.ts:1:0)');
        });

        it('맵이 못 푸는 프레임은 원문 그대로 둔다 — 일부만 풀려도 나머지를 잃지 않는다', () => {
            const frame = 'native@https://x/index-abc.js:99:1';

            expect(resolveStack(MAP, frame)).toBe(frame);
            expect(resolveStack(MAP, 'Promise@[native code]')).toBe('Promise@[native code]');
        });

        it('여러 줄 스택에서 푼 프레임과 못 푼 프레임이 함께 남는다', () => {
            const out = resolveStack(MAP, ['a@https://x/index-abc.js:1:9', 'b@https://x/index-abc.js:99:1'].join('\n'));

            expect(out.split('\n')).toEqual([
                'getMyProfile (apps/web/src/app/hooks/useMyProfile.ts:1:9)',
                'b@https://x/index-abc.js:99:1',
            ]);
        });

        it('bundle 을 주면 그 번들의 프레임만 바꾼다 — 다른 번들은 좌표가 맞아도 건드리지 않는다', () => {
            const stack = ['a@https://x/index-abc.js:1:9', 'b@https://x/chunk-zzz.js:1:9'].join('\n');

            expect(resolveStack(MAP, stack, 'index-abc.js').split('\n')).toEqual([
                'getMyProfile (apps/web/src/app/hooks/useMyProfile.ts:1:9)',
                'b@https://x/chunk-zzz.js:1:9',
            ]);
        });

        it('bundle 이 없으면 좌표가 맞는 모든 프레임을 바꾼다 (맵을 직접 고른 경우)', () => {
            const stack = ['a@https://x/index-abc.js:1:9', 'b@https://x/chunk-zzz.js:1:9'].join('\n');

            expect(resolveStack(MAP, stack).split('\n')).toEqual([
                'getMyProfile (apps/web/src/app/hooks/useMyProfile.ts:1:9)',
                'getMyProfile (apps/web/src/app/hooks/useMyProfile.ts:1:9)',
            ]);
        });
    });

    describe('readBundleNames', () => {
        it('스택이 가리키는 번들 파일명을 중복 없이 모은다', () => {
            const stack = [
                'a@https://dou-dev.chatic.io/assets/index-abc.js:1:9',
                'b@https://dou-dev.chatic.io/assets/index-abc.js:2:3',
                'c@https://dou-dev.chatic.io/assets/chunk-zzz.js:1:1',
            ].join('\n');

            expect(readBundleNames(stack)).toEqual(['index-abc.js', 'chunk-zzz.js']);
        });

        it('js 가 아닌 프레임은 세지 않는다', () => {
            expect(readBundleNames('Promise@[native code]')).toEqual([]);
        });
    });
});
