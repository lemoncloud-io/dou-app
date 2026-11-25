import { resolveChannelTitle } from './resolveChannelTitle';

import type { DomainChannel } from '@chatic/runtime-react';

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

        it('names a peer with no place profile by their cloud-profile name', () => {
            const title = resolveChannelTitle({
                channel: channel({ stereo: 'dm', cid: '1000001' }),
                uid: 'me',
                peerCloudName: '임마',
                ...labels,
            });
            expect(title).toBe('임마');
        });

        it('keeps the place-profile nick above the cloud-profile name', () => {
            const title = resolveChannelTitle({
                channel: channel({ stereo: 'dm', cid: '1000001' }),
                uid: 'me',
                peerNick: 'webB',
                peerCloudName: '레인',
                ...labels,
            });
            expect(title).toBe('webB');
        });

        it('keeps the cloud-profile name above channel.name', () => {
            const title = resolveChannelTitle({
                channel: channel({ stereo: 'dm', cid: '1000001', name: '서버 이름' }),
                uid: 'me',
                peerCloudName: '임마',
                ...labels,
            });
            expect(title).toBe('임마');
        });

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

    describe('cloud-profile name outside a cloud 1:1', () => {
        it('is not read for a relay 1:1', () => {
            const title = resolveChannelTitle({
                channel: channel({ stereo: 'dm', cid: 'default', sid: 'S:relay' }),
                uid: 'me',
                peerCloudName: '임마',
                ...labels,
            });
            expect(title).toBe('대화 상대');
        });

        it('is not read for a group room', () => {
            const title = resolveChannelTitle({
                channel: channel({ stereo: 'private', cid: '1000001' }),
                uid: 'me',
                peerCloudName: '임마',
                ...labels,
            });
            expect(title).toBe('이름 없는 채팅방');
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

    describe('group channel — I am a member', () => {
        it('ignores my join nick and uses channel.name', () => {
            const title = resolveChannelTitle({
                channel: channel({ name: '오너가 정한 이름', ownerId: 'someone-else' }),
                uid: 'me',
                joinNick: '내가 정한 이름',
                ...labels,
            });
            expect(title).toBe('오너가 정한 이름');
        });

        it('ignores the embedded $join.nick too', () => {
            const title = resolveChannelTitle({
                channel: channel({
                    name: '오너가 정한 이름',
                    ownerId: 'someone-else',
                    $join: { nick: '임베드닉' },
                } as Partial<DomainChannel>),
                uid: 'me',
                ...labels,
            });
            expect(title).toBe('오너가 정한 이름');
        });

        it('uses channel.name when I have no join nick', () => {
            const title = resolveChannelTitle({
                channel: channel({ name: '오너가 정한 이름', ownerId: 'someone-else' }),
                uid: 'me',
                ...labels,
            });
            expect(title).toBe('오너가 정한 이름');
        });

        it('falls to the unnamed label when the room has no name, join nick or not', () => {
            const title = resolveChannelTitle({
                channel: channel({ name: '  ', ownerId: 'someone-else' }),
                uid: 'me',
                joinNick: '내가 정한 이름',
                ...labels,
            });
            expect(title).toBe('이름 없는 채팅방');
        });

        it('reads the same without my uid', () => {
            const title = resolveChannelTitle({
                channel: channel({ name: '채널 이름', ownerId: 'me' }),
                joinNick: '내별명',
                ...labels,
            });
            expect(title).toBe('채널 이름');
        });
    });
});
