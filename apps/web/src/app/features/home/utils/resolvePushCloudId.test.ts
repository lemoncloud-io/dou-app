import { RELAY_CLOUD_ID, resolvePushCloudId } from './resolvePushCloudId';

const resolveContext = jest.fn();
const deps = (cids: string[] = ['cloud_1', 'cloud_2', RELAY_CLOUD_ID]) => ({ cids, resolveContext });

const context = (
    channels: Record<string, { id: string; sid?: string; name?: string }> = {},
    joins: Record<string, { userId?: string }> = {}
) => ({ channelsByRef: channels, sitesByRef: {}, joinsByRef: joins, lastChatsByRef: {} });

beforeEach(() => {
    jest.clearAllMocks();
});

describe('resolvePushCloudId — 크로스 클라우드 푸시의 출처 클라우드 판별', () => {
    it("'#' 센티널은 relay(cid='default')로 판별한다 (ADR-0045)", async () => {
        await expect(resolvePushCloudId({ cid: '#' }, deps())).resolves.toBe(RELAY_CLOUD_ID);
        expect(resolveContext).not.toHaveBeenCalled();
    });

    it('유효한 cid는 그대로 통과한다', async () => {
        await expect(resolvePushCloudId({ cid: 'cloud_9' }, deps())).resolves.toBe('cloud_9');
        expect(resolveContext).not.toHaveBeenCalled();
    });

    it('힌트가 전혀 없으면 캐시를 읽지 않고 null이다', async () => {
        await expect(resolvePushCloudId({}, deps())).resolves.toBeNull();
        expect(resolveContext).not.toHaveBeenCalled();
    });

    it('빈 cid + uid가 유일한 클라우드로 좁혀지면 그 클라우드를 채택한다', async () => {
        resolveContext.mockResolvedValue(context({}, { 'cloud_1:ch1': { userId: 'u1' } }));

        await expect(resolvePushCloudId({ cid: '', uid: 'u1' }, deps())).resolves.toBe('cloud_1');
    });

    it('uid가 여러 클라우드에 걸치면(비유일) uid 경로를 포기하고 channelId 폴백으로 넘어간다', async () => {
        resolveContext.mockResolvedValue(
            context(
                { 'cloud_1:ch1': { id: 'ch1' } },
                { 'cloud_1:ch1': { userId: 'u1' }, 'cloud_2:ch2': { userId: 'u1' } }
            )
        );

        await expect(resolvePushCloudId({ uid: 'u1', channelId: 'ch1' }, deps())).resolves.toBe('cloud_1');
    });

    it('uid도 channelId도 후보를 좁히지 못하면 null이다 (오탐보다 미탐)', async () => {
        resolveContext.mockResolvedValue(
            context({}, { 'cloud_1:ch1': { userId: 'u1' }, 'cloud_2:ch2': { userId: 'u1' } })
        );

        await expect(resolvePushCloudId({ uid: 'u1' }, deps())).resolves.toBeNull();
    });

    it('channelId만으로 유일하면 채택한다', async () => {
        resolveContext.mockResolvedValue(context({ 'cloud_2:ch5': { id: 'ch5' } }));

        await expect(resolvePushCloudId({ channelId: 'ch5' }, deps())).resolves.toBe('cloud_2');
    });

    it('channelId가 여러 클라우드에 걸치면 sid로 좁히되, 좁혀서 후보가 남을 때만 적용한다', async () => {
        resolveContext.mockResolvedValue(
            context({
                'cloud_1:ch5': { id: 'ch5', sid: 'site-a' },
                'cloud_2:ch5': { id: 'ch5', sid: 'site-b' },
            })
        );

        await expect(resolvePushCloudId({ channelId: 'ch5', sid: 'site-b' }, deps())).resolves.toBe('cloud_2');
    });

    it('sid가 후보를 전부 걸러내면(스테일 sid) sid 필터를 무시하고 이전 후보를 유지한다', async () => {
        resolveContext.mockResolvedValue(context({ 'cloud_1:ch5': { id: 'ch5', sid: 'site-a' } }));

        // sid가 실제 후보와 안 맞아도(스테일) 유일 채널 후보이므로 그대로 채택.
        await expect(resolvePushCloudId({ channelId: 'ch5', sid: 'site-does-not-exist' }, deps())).resolves.toBe(
            'cloud_1'
        );
    });

    it('channelId가 여러 클라우드에 걸치고 좁힐 수단도 없으면 null이다', async () => {
        resolveContext.mockResolvedValue(context({ 'cloud_1:ch5': { id: 'ch5' }, 'cloud_2:ch5': { id: 'ch5' } }));

        await expect(resolvePushCloudId({ channelId: 'ch5' }, deps())).resolves.toBeNull();
    });

    it('조회할 클라우드가 없으면 캐시를 건드리지 않고 null이다', async () => {
        await expect(resolvePushCloudId({ uid: 'u1' }, deps([]))).resolves.toBeNull();
        expect(resolveContext).not.toHaveBeenCalled();
    });
});
