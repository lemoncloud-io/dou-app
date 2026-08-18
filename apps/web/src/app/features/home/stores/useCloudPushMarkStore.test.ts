import { useCloudPushMarkStore } from './useCloudPushMarkStore';

beforeEach(() => {
    useCloudPushMarkStore.setState({ badged: {} });
});

describe('useCloudPushMarkStore — 크로스 클라우드 푸시 마크', () => {
    it('mark은 클라우드를 badged 집합에 넣는다', () => {
        useCloudPushMarkStore.getState().mark('cloud_1');

        expect(useCloudPushMarkStore.getState().badged).toEqual({ cloud_1: true });
    });

    it('이미 마크된 클라우드를 다시 mark하면 같은 state 참조를 반환한다 (불필요 리렌더 방지)', () => {
        useCloudPushMarkStore.getState().mark('cloud_1');
        const before = useCloudPushMarkStore.getState();

        useCloudPushMarkStore.getState().mark('cloud_1');

        expect(useCloudPushMarkStore.getState()).toBe(before);
    });

    it('clear는 그 클라우드만 badged에서 지운다', () => {
        useCloudPushMarkStore.getState().mark('cloud_1');
        useCloudPushMarkStore.getState().mark('cloud_2');

        useCloudPushMarkStore.getState().clear('cloud_1');

        expect(useCloudPushMarkStore.getState().badged).toEqual({ cloud_2: true });
    });

    it('마크되지 않은 클라우드를 clear하면 같은 state 참조를 반환한다', () => {
        const before = useCloudPushMarkStore.getState();

        useCloudPushMarkStore.getState().clear('cloud_9');

        expect(useCloudPushMarkStore.getState()).toBe(before);
    });
});
