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

    // A held event means home is not the screen the user asked for, so the boot cover has to stay
    // until the replay has navigated — and not a moment longer, or a cold start sits under it.
    describe('boot cover', () => {
        const flush = () => new Promise(resolve => setTimeout(resolve, 0));
        const createCoveredStore = () => {
            const releaseCover = jest.fn();
            const holdCover = jest.fn(() => releaseCover);
            const store = createPendingNavigationStore(handler => {
                emit = handler;
                return jest.fn();
            }, holdCover);
            return { store, holdCover, releaseCover };
        };

        it('holds the cover once while events are held, however many arrive', () => {
            const { store, holdCover, releaseCover } = createCoveredStore();
            store.start();

            emit!(makeMessage('/channels/roomA/room'));
            emit!(makeMessage('/channels/roomB/room'));

            expect(holdCover).toHaveBeenCalledTimes(1);
            expect(releaseCover).not.toHaveBeenCalled();
        });

        it('releases the cover only after the replay reached the consumer', async () => {
            const { store, releaseCover } = createCoveredStore();
            store.start();
            emit!(makeMessage('/channels/roomA/room'));

            const consumer = jest.fn(() => expect(releaseCover).not.toHaveBeenCalled());
            store.register(consumer);

            expect(consumer).toHaveBeenCalledTimes(1);
            await flush();
            expect(releaseCover).toHaveBeenCalledTimes(1);
        });

        // A push into another cloud navigates only after the cloud switch it awaits; lifting the
        // cover when the consumer merely returned would show home first.
        it('keeps the cover until an async replay settles', async () => {
            const { store, releaseCover } = createCoveredStore();
            store.start();
            emit!(makeMessage('/channels/roomA/room'));

            let land!: () => void;
            store.register(() => new Promise<void>(resolve => (land = resolve)));
            await flush();
            expect(releaseCover).not.toHaveBeenCalled();

            land();
            await flush();
            expect(releaseCover).toHaveBeenCalledTimes(1);
        });

        it('lets go of the cover when an async replay fails', async () => {
            const { store, releaseCover } = createCoveredStore();
            store.start();
            emit!(makeMessage('/channels/roomA/room'));

            store.register(() => Promise.reject(new Error('switch failed')));
            await flush();

            expect(releaseCover).toHaveBeenCalledTimes(1);
        });

        it('takes no hold for an event that goes straight to a mounted consumer', () => {
            const { store, holdCover } = createCoveredStore();
            store.start();
            store.register(jest.fn());

            emit!(makeMessage('/channels/roomA/room'));

            expect(holdCover).not.toHaveBeenCalled();
        });

        it('releases the cover when stopped with an event still held', () => {
            const { store, releaseCover } = createCoveredStore();
            store.start();
            emit!(makeMessage('/channels/roomA/room'));

            store.stop();

            expect(releaseCover).toHaveBeenCalledTimes(1);
        });
    });
});
