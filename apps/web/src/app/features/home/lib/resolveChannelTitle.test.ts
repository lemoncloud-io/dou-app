import { resolveChannelTitle } from './resolveChannelTitle';

import type { DomainChannel } from '@chatic/data';

// Minimal channel factory — only the fields resolveChannelTitle reads.
const channel = (overrides: Partial<DomainChannel>): DomainChannel =>
    ({ id: 'ch-1', ...overrides }) as unknown as DomainChannel;

const labels = { selfLabel: '나와의 채팅', unnamedLabel: '이름 없는 채팅방' };

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
