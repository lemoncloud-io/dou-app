import {
    clearDebugObservation,
    getDebugObservation,
    publishDebugObservation,
    subscribeDebugObservation,
    type DebugSharedObservation,
} from './sharedObservationStore';

// The mirror that lets the out-of-tree overlay read the app's shared observations. What matters here
// is only the store contract — a missing publish must read as null (the tabs branch on it), and a
// re-publish of the same objects must not wake subscribers.
const activeCloud = {
    channels: [],
    isLoaded: true,
    myJoins: new Map(),
    unreads: { byChannel: {}, byPlace: {}, total: 0 },
} as DebugSharedObservation['activeCloud'];
const otherCloud = { byCloud: {}, total: 0 } as DebugSharedObservation['otherCloud'];
const room = {
    surface: 'room',
    channelId: 'ch-1',
    channel: null,
    rendered: [],
    rows: [],
} as DebugSharedObservation['room'];
const EMPTY = { activeCloud: null, otherCloud: null, room: null, roomFocus: null };

describe('sharedObservationStore — 오버레이가 읽는 공유 관측 미러', () => {
    beforeEach(() => {
        clearDebugObservation();
    });

    it('아무것도 게시되지 않았으면 두 슬롯이 null이다', () => {
        expect(getDebugObservation()).toEqual(EMPTY);
    });

    it('게시한 슬롯만 바뀌고 나머지는 유지된다', () => {
        publishDebugObservation({ activeCloud });
        expect(getDebugObservation()).toEqual({ ...EMPTY, activeCloud });

        publishDebugObservation({ otherCloud });
        expect(getDebugObservation()).toEqual({ ...EMPTY, activeCloud, otherCloud });
    });

    it('구독자는 게시마다 깨어난다', () => {
        const listener = jest.fn();
        const unsubscribe = subscribeDebugObservation(listener);

        publishDebugObservation({ activeCloud });
        expect(listener).toHaveBeenCalledTimes(1);

        unsubscribe();
        publishDebugObservation({ otherCloud });
        expect(listener).toHaveBeenCalledTimes(1);
    });

    it('같은 객체를 다시 게시하면 구독자를 깨우지 않는다', () => {
        publishDebugObservation({ activeCloud, otherCloud });
        const listener = jest.fn();
        subscribeDebugObservation(listener);

        // The reporter publishes from an effect on every provider re-render; an unchanged pair must
        // not re-render the tabs.
        publishDebugObservation({ activeCloud, otherCloud });
        expect(listener).not.toHaveBeenCalled();
    });

    it('clear는 리포터가 사라진 뒤 죽은 스냅샷이 남지 않게 비운다', () => {
        publishDebugObservation({ activeCloud, otherCloud });
        clearDebugObservation();
        expect(getDebugObservation()).toEqual(EMPTY);
    });

    it('wakes subscribers when only a room slot changes', () => {
        publishDebugObservation({ activeCloud, otherCloud });
        const listener = jest.fn();
        subscribeDebugObservation(listener);

        // The equality check covers every slot, so a room published beside unchanged cloud slots
        // still reaches the Room screen.
        publishDebugObservation({ room });
        expect(listener).toHaveBeenCalledTimes(1);

        publishDebugObservation({ room });
        expect(listener).toHaveBeenCalledTimes(1);
    });
});
