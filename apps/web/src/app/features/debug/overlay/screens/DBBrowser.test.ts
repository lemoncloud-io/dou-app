// Stub the runtime module so importing DBBrowser doesn't pull in the real socket lib
// (which needs a TextEncoder polyfill under jsdom). The TEMPLATES we test are pure.
jest.mock('@chatic/app-runtime', () => ({ useRuntimeRepositories: jest.fn() }));

import { TEMPLATES } from './DBBrowser';

const ALL_TYPES = ['channel', 'chat', 'user', 'join', 'site', 'invitecloud', 'profile'] as const;

describe('DBBrowser TEMPLATES', () => {
    it('모든 캐시 타입에 대해 비어있지 않은 id를 가진 행을 만든다', () => {
        for (const type of ALL_TYPES) {
            const row = TEMPLATES[type]();
            expect(typeof row.id).toBe('string');
            expect((row.id as string).length).toBeGreaterThan(0);
        }
    });

    it('호출할 때마다 새 고유 id를 생성한다(원클릭 생성 시 충돌 없음)', () => {
        const a = TEMPLATES.channel().id;
        const b = TEMPLATES.channel().id;
        expect(a).not.toBe(b);
    });

    it('작성 패널을 미리 채울 수 있도록 JSON 직렬화가 가능하다', () => {
        const row = TEMPLATES.chat();
        const json = JSON.stringify(row);
        expect(JSON.parse(json)).toEqual(row);
        // chat needs channelId + chatNo to be useful — present (empty/zero) in the template
        expect(row).toHaveProperty('channelId');
        expect(row).toHaveProperty('chatNo');
    });
});
