import { PushMarksBridge } from './PushMarksBridge';

const mockDrain = jest.fn();

jest.mock('react-native', () => ({
    NativeModules: {
        PushMarks: { drain: () => mockDrain() },
    },
}));

describe('PushMarksBridge.drain — 크로스 클라우드 푸시 마크 drain', () => {
    beforeEach(() => {
        mockDrain.mockClear();
    });

    it('네이티브 PushMarks.drain 결과를 그대로 반환한다', async () => {
        mockDrain.mockResolvedValue([{ cid: 'cloud_1' }, { uid: 'u1', channelId: 'ch1' }]);

        await expect(PushMarksBridge.drain()).resolves.toEqual([{ cid: 'cloud_1' }, { uid: 'u1', channelId: 'ch1' }]);
    });
});

describe('PushMarksBridge.drain — 네이티브 모듈 미등록', () => {
    it('구버전 셸(모듈 부재)에서는 빈 배열로 우아하게 축소한다', async () => {
        jest.resetModules();
        jest.doMock('react-native', () => ({ NativeModules: {} }));

        const { PushMarksBridge: bridgeWithoutModule } = await import('./PushMarksBridge');

        await expect(bridgeWithoutModule.drain()).resolves.toEqual([]);

        jest.dontMock('react-native');
    });
});
