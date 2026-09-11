import { resolveChatOwnerName, resolveUserName, type DisplayNameSources } from './displayName';

const sources = (over: Partial<DisplayNameSources> = {}): DisplayNameSources => ({
    profileMap: new Map(),
    memberById: new Map(),
    userId: 'me',
    unknownLabel: '알 수 없는 사용자',
    meLabel: '나',
    ...over,
});

describe('resolveUserName — 사용자 id로 이름 해석', () => {
    it('사이트 프로필 닉이 가장 세다', () => {
        const s = sources({
            profileMap: new Map([['ada', { nick: '프로필닉' }]]),
            memberById: new Map([['ada', { nick: '멤버닉', name: '멤버이름' }]]),
        });

        expect(resolveUserName('ada', s)).toBe('프로필닉');
    });

    it('프로필이 없으면 멤버 닉, 그다음 멤버 이름', () => {
        expect(resolveUserName('ada', sources({ memberById: new Map([['ada', { nick: '멤버닉', name: 'n' }]]) }))).toBe(
            '멤버닉'
        );
        expect(resolveUserName('ada', sources({ memberById: new Map([['ada', { name: '멤버이름' }]]) }))).toBe(
            '멤버이름'
        );
    });

    // 빈 문자열·공백만 있는 닉은 "이름이 있다"가 아니다 — 옛 체인은 `??`를 써서 빈 닉을
    // 통과시켰고, 이름 없는 빈 줄이 나왔다.
    it('공백뿐인 닉은 다음 단계로 넘긴다', () => {
        const s = sources({
            profileMap: new Map([['ada', { nick: '   ' }]]),
            memberById: new Map([['ada', { name: '멤버이름' }]]),
        });

        expect(resolveUserName('ada', s)).toBe('멤버이름');
    });

    // 원시 id는 이름이 아니다 — 읽을 수 없고, 내부 식별자를 UI로 흘리고, 사람이 아니라
    // 데이터 손상처럼 보인다.
    it('아무것도 못 찾으면 라벨을 쓰고 절대 id를 보여주지 않는다', () => {
        const name = resolveUserName('f7fa3ac3-50e9-425c-b8d5-a6214b9dee00', sources());

        expect(name).toBe('알 수 없는 사용자');
        expect(name).not.toContain('f7fa3ac3');
    });

    // 서버는 이름 없는 사용자의 name에 계정 UUID를 심는다(nick.ts의 그 흐름). "이름이 있다"를
    // 만족하면서 사람 이름은 아니므로 통과가 아니라 낙하해야 한다.
    it('UUID 모양의 name은 이름으로 인정하지 않는다', () => {
        const s = sources({
            memberById: new Map([['ada', { name: 'f7fa3ac3-50e9-425c-b8d5-a6214b9dee50' }]]),
        });

        expect(resolveUserName('ada', s)).toBe('알 수 없는 사용자');
    });

    it('자기 id를 그대로 담은 name도 낙하한다', () => {
        const s = sources({ memberById: new Map([['ada', { nick: 'ada', name: '멤버이름' }]]) });

        expect(resolveUserName('ada', s)).toBe('멤버이름');
    });

    it('해석 실패가 나 자신이면 "나"라고 한다', () => {
        expect(resolveUserName('me', sources())).toBe('나');
    });

    it('id가 비어 있으면 "나"가 아니라 알 수 없는 사용자다', () => {
        expect(resolveUserName('', sources())).toBe('알 수 없는 사용자');
    });
});

describe('resolveChatOwnerName — 채팅 행의 작성자 이름', () => {
    it('캐시가 임베드된 owner$ 이름을 이긴다', () => {
        const s = sources({ profileMap: new Map([['ada', { nick: '프로필닉' }]]) });

        expect(resolveChatOwnerName({ ownerId: 'ada', owner$: { name: '옛이름' } }, s)).toBe('프로필닉');
    });

    // 임베드는 행을 쓸 때 찍힌 스냅샷이다 — 캐시보다 위에 두면 그 뒤의 개명이 되살아난다.
    it('캐시에 없을 때만 임베드로 떨어진다', () => {
        expect(resolveChatOwnerName({ ownerId: 'ada', owner$: { name: '임베드이름' } }, sources())).toBe('임베드이름');
    });

    // 게스트 자기 대화에서 실제로 나온 모양: ownerId는 짧은 숫자 id인데 owner$.name에는
    // 그와 다른 계정 UUID가 들어 있다. id 비교만으로는 못 걸러진다.
    it('임베드 owner$.name이 UUID면 무시한다', () => {
        const chat = { ownerId: '1001648', owner$: { name: 'f7fa3ac3-50e9-425c-b8d5-a6214b9dee50' } };

        expect(resolveChatOwnerName(chat, sources())).toBe('알 수 없는 사용자');
        expect(resolveChatOwnerName(chat, sources({ userId: '1001648' }))).toBe('나');
    });

    it('작성자를 못 찾으면 라벨을 쓴다', () => {
        expect(resolveChatOwnerName({ ownerId: 'ghost' }, sources())).toBe('알 수 없는 사용자');
        expect(resolveChatOwnerName({ ownerId: 'me' }, sources())).toBe('나');
    });

    it('ownerId가 없는 행은 임베드 이름이라도 살린다', () => {
        expect(resolveChatOwnerName({ owner$: { name: '임베드이름' } }, sources())).toBe('임베드이름');
        expect(resolveChatOwnerName({}, sources())).toBe('알 수 없는 사용자');
    });
});
