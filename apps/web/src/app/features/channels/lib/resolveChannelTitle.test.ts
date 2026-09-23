import { resolveChannelTitle } from './resolveChannelTitle';

import type { DomainChannel } from '@chatic/data';

// Minimal channel factory — only the fields resolveChannelTitle reads.
const channel = (overrides: Partial<DomainChannel>): DomainChannel =>
    ({ id: 'ch-1', ...overrides }) as unknown as DomainChannel;

const labels = { selfLabel: '나와의 채팅', unnamedLabel: '이름 없는 채팅방', dmUnnamedLabel: '대화 상대' };

describe('resolveChannelTitle', () => {
    describe('self 채널', () => {
        it('join nick이 있으면 그것을 쓴다', () => {
            const title = resolveChannelTitle({
                channel: channel({ stereo: 'self', name: '무시됨' }),
                uid: 'me',
                joinNick: '오늘의 할일',
                myNick: '프로필닉',
                ...labels,
            });
            expect(title).toBe('오늘의 할일');
        });

        it('join nick이 없으면 임베드된 $join.nick으로 폴백한다', () => {
            const title = resolveChannelTitle({
                channel: channel({ stereo: 'self', $join: { nick: '임베드닉' } as never }),
                uid: 'me',
                myNick: '프로필닉',
                ...labels,
            });
            expect(title).toBe('임베드닉');
        });

        it('nick이 서버 기본값(내 userId)이면 프로필 닉으로 폴백한다', () => {
            const title = resolveChannelTitle({
                channel: channel({ stereo: 'self' }),
                uid: 'me',
                joinNick: 'me',
                myNick: '프로필닉',
                ...labels,
            });
            expect(title).toBe('프로필닉');
        });

        it('nick도 프로필 닉도 없으면 self 라벨을 쓴다', () => {
            const title = resolveChannelTitle({ channel: channel({ stereo: 'self' }), uid: 'me', ...labels });
            expect(title).toBe('나와의 채팅');
        });
    });

    // ADR-0039: a DM never reaches the owner/member branch. The inviter is the owner, so hitting
    // that branch would let the server-made channel.name win and ignore the peer's profile — the cause of the mismatch with the room screen.
    // The lineage reads `cid` — the relay cloud vs a subscription one (ADR-0111). These cases are
    // the relay lineage unless they say otherwise.
    describe('DM 채널', () => {
        it('내 join nick을 최우선한다', () => {
            const title = resolveChannelTitle({
                channel: channel({ stereo: 'dm', cid: 'default', sid: 'S:relay', name: '서버 이름', ownerId: 'me' }),
                uid: 'me',
                joinNick: '토끼친구',
                peerNick: '토끼',
                ...labels,
            });
            expect(title).toBe('토끼친구');
        });

        it('join nick이 없으면 상대 프로필 닉을 쓴다 — 내가 오너여도 channel.name이 이기지 못한다', () => {
            const title = resolveChannelTitle({
                channel: channel({ stereo: 'dm', name: '서버 이름', ownerId: 'me' }),
                uid: 'me',
                peerNick: '토끼',
                ...labels,
            });
            expect(title).toBe('토끼');
        });

        it('상대 프로필이 없으면 channel.name으로 폴백한다', () => {
            const title = resolveChannelTitle({
                channel: channel({ stereo: 'dm', name: '서버 이름', ownerId: 'me' }),
                uid: 'me',
                ...labels,
            });
            expect(title).toBe('서버 이름');
        });

        it('체인이 전부 비면 DM 전용 라벨을 쓴다 (그룹의 unnamed 라벨이 아니다)', () => {
            const title = resolveChannelTitle({
                channel: channel({ stereo: 'dm', ownerId: 'me' }),
                uid: 'me',
                ...labels,
            });
            expect(title).toBe('대화 상대');
        });

        it('임베드된 $join.nick도 읽는다', () => {
            const title = resolveChannelTitle({
                channel: channel({
                    stereo: 'dm',
                    cid: 'default',
                    sid: 'S:relay',
                    $join: { nick: '임베드닉' } as never,
                    name: '서버 이름',
                }),
                uid: 'me',
                peerNick: '토끼',
                ...labels,
            });
            expect(title).toBe('임베드닉');
        });
    });

    // The server seeds `join.nick` on a room nobody has named, and a seeded value that looks like a
    // person cannot be told from one a person typed. A cloud 1:1 has no step where a name IS typed,
    // so it drops that rung rather than trust it (ADR-0111).
    describe('DM 채널 — 클라우드 계보', () => {
        it('사람 이름처럼 생긴 join nick이어도 무시하고 프로필 닉을 쓴다', () => {
            const title = resolveChannelTitle({
                channel: channel({ stereo: 'dm', cid: '1000001', name: '서버 이름', ownerId: 'me' }),
                uid: 'me',
                joinNick: 'Kate Bell',
                peerNick: '치이카와 분신 1호',
                ...labels,
            });
            expect(title).toBe('치이카와 분신 1호');
        });

        it('임베드된 $join.nick도 같이 무시한다 — 같은 값이 두 경로로 들어온다', () => {
            const title = resolveChannelTitle({
                channel: channel({
                    stereo: 'dm',
                    cid: '1000001',
                    $join: { nick: 'Kate Bell' } as never,
                    name: '서버 이름',
                }),
                uid: 'me',
                peerNick: '치이카와 분신 1호',
                ...labels,
            });
            expect(title).toBe('치이카와 분신 1호');
        });

        // Dropping the rung must not skip the rest of the chain.
        it('프로필이 없으면 channel.name, 그것도 없으면 라벨로 계속 내려간다', () => {
            expect(
                resolveChannelTitle({
                    channel: channel({ stereo: 'dm', cid: '1000001', name: '서버 이름' }),
                    uid: 'me',
                    joinNick: 'Kate Bell',
                    ...labels,
                })
            ).toBe('서버 이름');

            expect(
                resolveChannelTitle({
                    channel: channel({ stereo: 'dm', cid: '1000001' }),
                    uid: 'me',
                    joinNick: 'Kate Bell',
                    ...labels,
                })
            ).toBe('대화 상대');
        });

        // The relay side types that name on the invite form, so it is a real choice and survives.
        it('중계 1:1의 join nick은 그대로 이긴다 — 비목표 보호', () => {
            const title = resolveChannelTitle({
                channel: channel({ stereo: 'dm', cid: 'default', sid: 'S:relay', name: '서버 이름' }),
                uid: 'me',
                joinNick: '토끼친구',
                peerNick: '토끼',
                ...labels,
            });
            expect(title).toBe('토끼친구');
        });
    });

    describe('그룹 채널 — 내가 오너', () => {
        it('내 join nick을 무시하고 channel.name을 쓴다', () => {
            const title = resolveChannelTitle({
                channel: channel({ name: '스터디방', ownerId: 'me' }),
                uid: 'me',
                joinNick: '내별명',
                ...labels,
            });
            expect(title).toBe('스터디방');
        });

        it('channel.name이 비어 있으면 unnamed 라벨을 쓴다', () => {
            const title = resolveChannelTitle({
                channel: channel({ name: '   ', ownerId: 'me' }),
                uid: 'me',
                ...labels,
            });
            expect(title).toBe('이름 없는 채팅방');
        });
    });

    describe('그룹 채널 — 내가 참여자', () => {
        it('내 join nick을 우선한다', () => {
            const title = resolveChannelTitle({
                channel: channel({ name: '오너가 정한 이름', ownerId: 'someone-else' }),
                uid: 'me',
                joinNick: '내가 정한 이름',
                ...labels,
            });
            expect(title).toBe('내가 정한 이름');
        });

        it('join nick이 없으면 channel.name으로 폴백한다', () => {
            const title = resolveChannelTitle({
                channel: channel({ name: '오너가 정한 이름', ownerId: 'someone-else' }),
                uid: 'me',
                ...labels,
            });
            expect(title).toBe('오너가 정한 이름');
        });

        it('uid를 모르면 오너로 취급하지 않는다', () => {
            const title = resolveChannelTitle({
                channel: channel({ name: '채널 이름', ownerId: 'me' }),
                joinNick: '내별명',
                ...labels,
            });
            expect(title).toBe('내별명');
        });
    });
});
