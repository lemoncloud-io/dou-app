import { createPendingNavigationStore } from './pendingNavigationStore';
import type { AppMessageData } from '@chatic/app-messages';

jest.mock('@chatic/bridges', () => ({
    webClient: { onEvent: jest.fn() },
    logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

type OnNavigateMessage = AppMessageData<'OnNavigate'>;

const makeMessage = (path: string): OnNavigateMessage =>
    ({ type: 'OnNavigate', success: true, data: { path, replace: false } }) as OnNavigateMessage;

describe('pendingNavigationStore', () => {
    // Simulates the bridge: capture the handler so tests can emit events at will.
    let emit: ((message: OnNavigateMessage) => void) | undefined;
    let unsubscribe: jest.Mock;

    const createStore = () => {
        unsubscribe = jest.fn();
        return createPendingNavigationStore(handler => {
            emit = handler;
            return unsubscribe;
        });
    };

    beforeEach(() => {
        emit = undefined;
    });

    it('소비자가 없을 때 도착한 이벤트를 보관했다가 등록 시 즉시 전달한다', () => {
        const store = createStore();
        store.start();
        emit!(makeMessage('/channels/roomA/room'));

        const consumer = jest.fn();
        store.register(consumer);

        expect(consumer).toHaveBeenCalledTimes(1);
        expect(consumer).toHaveBeenCalledWith(makeMessage('/channels/roomA/room'));
    });

    it('소비자가 없을 때 여러 이벤트가 오면 마지막 것만 보관한다', () => {
        const store = createStore();
        store.start();
        emit!(makeMessage('/channels/roomA/room'));
        emit!(makeMessage('/channels/roomB/room'));

        const consumer = jest.fn();
        store.register(consumer);

        expect(consumer).toHaveBeenCalledTimes(1);
        expect(consumer).toHaveBeenCalledWith(makeMessage('/channels/roomB/room'));
    });

    it('보관된 이벤트는 한 번만 소비된다 (재등록 시 재전달 없음)', () => {
        const store = createStore();
        store.start();
        emit!(makeMessage('/channels/roomA/room'));

        const first = jest.fn();
        const detachFirst = store.register(first);
        detachFirst();

        const second = jest.fn();
        store.register(second);

        expect(first).toHaveBeenCalledTimes(1);
        expect(second).not.toHaveBeenCalled();
    });

    it('소비자가 등록된 동안 도착한 이벤트는 직통으로 전달되고 보관되지 않는다', () => {
        const store = createStore();
        store.start();

        const consumer = jest.fn();
        store.register(consumer);
        emit!(makeMessage('/channels/roomA/room'));

        expect(consumer).toHaveBeenCalledTimes(1);
        expect(consumer).toHaveBeenCalledWith(makeMessage('/channels/roomA/room'));
    });

    it('소비자 해제 후 도착한 이벤트는 다시 보관되어 다음 등록에 전달된다', () => {
        const store = createStore();
        store.start();

        const first = jest.fn();
        const detach = store.register(first);
        detach();

        emit!(makeMessage('/channels/roomC/room'));

        const second = jest.fn();
        store.register(second);

        expect(first).not.toHaveBeenCalled();
        expect(second).toHaveBeenCalledWith(makeMessage('/channels/roomC/room'));
    });

    it('start는 멱등이라 중복 호출해도 구독이 하나만 유지된다', () => {
        const subscribe = jest.fn(() => jest.fn());
        const store = createPendingNavigationStore(subscribe);

        store.start();
        store.start();

        expect(subscribe).toHaveBeenCalledTimes(1);
    });

    it('stop은 구독을 해제하고 보관 중인 이벤트를 버린다', () => {
        const store = createStore();
        store.start();
        emit!(makeMessage('/channels/roomA/room'));

        store.stop();
        expect(unsubscribe).toHaveBeenCalledTimes(1);

        const consumer = jest.fn();
        store.register(consumer);
        expect(consumer).not.toHaveBeenCalled();
    });

    it('이전 소비자의 해제 함수가 뒤늦게 호출되어도 새 소비자를 밀어내지 않는다', () => {
        const store = createStore();
        store.start();

        const first = jest.fn();
        const detachFirst = store.register(first);

        const second = jest.fn();
        store.register(second);
        // Stale detach from the replaced consumer must be a no-op.
        detachFirst();

        emit!(makeMessage('/channels/roomD/room'));

        expect(second).toHaveBeenCalledWith(makeMessage('/channels/roomD/room'));
        expect(first).not.toHaveBeenCalled();
    });
});
