import { logger } from '@chatic/bridges';

import { divergenceReporter } from './divergenceReporter';

jest.mock('@chatic/bridges', () => ({
    logger: { debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

const warn = logger.warn as jest.Mock;
/** The observation payload of the first entry — flat, discriminated by `observation`. */
const dataOf = () => warn.mock.calls[0][2];

beforeEach(() => jest.clearAllMocks());

describe('divergenceReporter.badge — 뱃지 대조', () => {
    it('웹 총합과 기기 값이 다르면 warn을 남기고 내역을 함께 싣는다', () => {
        divergenceReporter.badge({ web: 0, native: 2, active: 0, others: 0 });

        expect(warn).toHaveBeenCalledTimes(1);
        expect(warn.mock.calls[0][0]).toBe('NOTIFICATION');
        expect(dataOf()).toEqual({
            observation: 'badge-divergence',
            web: 0,
            native: 2,
            delta: -2,
            breakdown: { active: 0, others: 0 },
        });
    });

    it('값이 같으면 아무것도 남기지 않는다', () => {
        divergenceReporter.badge({ web: 3, native: 3, active: 1, others: 2 });

        expect(warn).not.toHaveBeenCalled();
    });

    // Android can't read the icon value, so it comes back null. Treating that as 0 would make every device permanently diverge.
    it('기기 값을 읽을 수 없으면(null) 대조 자체를 건너뛴다', () => {
        divergenceReporter.badge({ web: 5, native: null, active: 5, others: 0 });

        expect(warn).not.toHaveBeenCalled();
    });

    it('어느 쪽이 앞서 있는지를 message로 구분한다', () => {
        divergenceReporter.badge({ web: 0, native: 2, active: 0, others: 0 });
        divergenceReporter.badge({ web: 4, native: 1, active: 4, others: 0 });

        expect(warn.mock.calls[0][1]).toContain('device ahead');
        expect(warn.mock.calls[1][1]).toContain('web ahead');
    });
});

describe('divergenceReporter.unread — 안 읽음 대조', () => {
    const base = { channelId: 'ch_1', headChatNo: 10, hasReadMetaNo: true };

    it('커서가 마크에 못 미치면 "cursor behind mark"로 남긴다', () => {
        divergenceReporter.unread({ ...base, markedChatNo: 10, cursorChatNo: 7, drawn: 3 });

        expect(warn.mock.calls[0][0]).toBe('CHAT');
        expect(warn.mock.calls[0][1]).toContain('cursor behind mark');
        expect(dataOf()).toMatchObject({ observation: 'unread-divergence', cursorLanded: false, drawn: 3 });
    });

    // If the cursor has landed but the count still remains, the cause is on the chatNo-metaNo conversion side (ADR-0048).
    it('커서가 도달했는데도 카운트가 남으면 다른 원인으로 구분해 남긴다', () => {
        divergenceReporter.unread({ ...base, markedChatNo: 10, cursorChatNo: 10, drawn: 2, hasReadMetaNo: false });

        expect(warn.mock.calls[0][1]).toContain('cursor landed but count remains');
        expect(dataOf()).toMatchObject({ cursorLanded: true, hasReadMetaNo: false });
    });

    it('마크한 적이 없으면 대조하지 않는다', () => {
        divergenceReporter.unread({ ...base, markedChatNo: undefined, cursorChatNo: 3, drawn: 5 });

        expect(warn).not.toHaveBeenCalled();
    });

    // It's normal for the count to remain if a new message arrives after reading — counting this as a divergence would flag every active room.
    it('마크 이후 머리가 전진했으면(새 메시지 도착) 대조하지 않는다', () => {
        divergenceReporter.unread({ ...base, headChatNo: 12, markedChatNo: 10, cursorChatNo: 10, drawn: 2 });

        expect(warn).not.toHaveBeenCalled();
    });

    it('카운트가 0이면 대조하지 않는다', () => {
        divergenceReporter.unread({ ...base, markedChatNo: 10, cursorChatNo: 4, drawn: 0 });

        expect(warn).not.toHaveBeenCalled();
    });
});

describe('divergenceReporter.member — 멤버 대조', () => {
    it('로스터에만 있는 멤버가 있으면 건수와 방향을 남긴다', () => {
        divergenceReporter.member({ channelId: 'ch_1', rosterOnly: 1, joinOnly: 0, joinCount: 3, rosterKnown: true });

        expect(warn.mock.calls[0][0]).toBe('CHANNEL');
        expect(warn.mock.calls[0][1]).toContain('roster ahead');
        expect(dataOf()).toEqual({
            observation: 'member-divergence',
            channelId: 'ch_1',
            rosterOnly: 1,
            joinOnly: 0,
            joinCount: 3,
        });
    });

    // A missing memberIds means "hasn't arrived yet", not "empty room". Treating it as 0 would flag every join as ahead.
    it('로스터를 아직 못 읽었으면 대조하지 않는다', () => {
        divergenceReporter.member({ channelId: 'ch_1', rosterOnly: 0, joinOnly: 2, joinCount: 2, rosterKnown: false });

        expect(warn).not.toHaveBeenCalled();
    });

    it('양쪽이 일치하면 아무것도 남기지 않는다', () => {
        divergenceReporter.member({ channelId: 'ch_1', rosterOnly: 0, joinOnly: 0, joinCount: 3, rosterKnown: true });

        expect(warn).not.toHaveBeenCalled();
    });

    // A join count of 0 doesn't distinguish between "empty room" and "cache not hydrated yet".
    it('join을 아직 못 읽었으면(0건) 대조하지 않는다', () => {
        divergenceReporter.member({ channelId: 'ch_1', rosterOnly: 2, joinOnly: 0, joinCount: 0, rosterKnown: true });

        expect(warn).not.toHaveBeenCalled();
    });
});

describe('divergenceReporter.cloudName — 표시 이름 대조', () => {
    it('캐시와 카탈로그가 다르면 길이만 남긴다', () => {
        divergenceReporter.cloudName({ cid: 'cloud_1', cachedName: '새이름', catalogName: '옛날이름' });

        expect(warn.mock.calls[0][0]).toBe('CLOUD');
        expect(dataOf()).toEqual({
            observation: 'cloud-name-divergence',
            cid: 'cloud_1',
            cachedLen: 3,
            catalogLen: 4,
        });
    });

    it('이름 원문은 엔트리에 싣지 않는다', () => {
        divergenceReporter.cloudName({ cid: 'cloud_1', cachedName: '비밀이름', catalogName: '옛것' });

        expect(JSON.stringify(warn.mock.calls[0])).not.toContain('비밀이름');
    });

    it('같으면 아무것도 남기지 않는다', () => {
        divergenceReporter.cloudName({ cid: 'cloud_1', cachedName: '같음', catalogName: '같음' });

        expect(warn).not.toHaveBeenCalled();
    });

    it('한쪽이 비어 있으면(콜드 캐시·미응답) 대조하지 않는다', () => {
        divergenceReporter.cloudName({ cid: 'cloud_1', cachedName: undefined, catalogName: '옛것' });
        divergenceReporter.cloudName({ cid: 'cloud_1', cachedName: '새것', catalogName: undefined });

        expect(warn).not.toHaveBeenCalled();
    });
});
