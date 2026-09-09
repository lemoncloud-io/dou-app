import { ConfigStore } from './ConfigStore';

describe('ConfigStore — 레인별 보관', () => {
    it('레인마다 따로 담고 서로 안 섞인다', () => {
        const store = new ConfigStore();
        store.write('local', 'a.key', 1);
        store.write('shell', 'a.key', 2);

        expect(store.read('local', 'a.key')).toEqual({ has: true, value: 1 });
        expect(store.read('shell', 'a.key')).toEqual({ has: true, value: 2 });
    });

    it('없는 값과 undefined를 구분한다', () => {
        const store = new ConfigStore();
        store.write('local', 'a.key', undefined);

        expect(store.read('local', 'a.key')).toEqual({ has: true, value: undefined });
        expect(store.read('local', '다른.키')).toEqual({ has: false });
    });

    it('레인을 통째로 갈아치울 수 있다 — 앱 주입 봉투가 이걸 쓴다', () => {
        const store = new ConfigStore();
        store.write('shell', '옛.키', 1);

        store.replaceLane('shell', { '새.키': 2 });

        expect(store.read('shell', '옛.키')).toEqual({ has: false });
        expect(store.read('shell', '새.키')).toEqual({ has: true, value: 2 });
    });
});

describe('ConfigStore — 알림', () => {
    it('물어본 키만 듣는다', () => {
        const store = new ConfigStore();
        const listener = jest.fn();
        store.subscribe(['a.key'], listener);

        store.notify(['다른.키']);
        expect(listener).not.toHaveBeenCalled();

        store.notify(['a.key']);
        expect(listener).toHaveBeenCalledTimes(1);
    });

    it('키를 안 주면 전부 듣는다', () => {
        const store = new ConfigStore();
        const listener = jest.fn();
        store.subscribe(undefined, listener);

        store.notify(['아무.키']);

        expect(listener).toHaveBeenCalledTimes(1);
    });

    it('구독을 끊으면 더 안 듣는다', () => {
        const store = new ConfigStore();
        const listener = jest.fn();
        const unsubscribe = store.subscribe(['a.key'], listener);

        unsubscribe();
        store.notify(['a.key']);

        expect(listener).not.toHaveBeenCalled();
    });

    it('물어본 키만 건네받는다 — 남의 변경까지 받으면 다시 걸러내야 한다', () => {
        const store = new ConfigStore();
        const listener = jest.fn();
        store.subscribe(['a.key'], listener);

        store.notify(['다른.키', 'a.key']);

        expect(listener).toHaveBeenCalledWith(['a.key']);
    });

    it('키를 안 준 리스너는 바뀐 키 전부를 건네받는다', () => {
        const store = new ConfigStore();
        const listener = jest.fn();
        store.subscribe(undefined, listener);

        store.notify(['a.key', 'b.key']);

        expect(listener).toHaveBeenCalledWith(['a.key', 'b.key']);
    });

    it('바뀐 키가 없으면 아무도 안 부른다', () => {
        const store = new ConfigStore();
        const listener = jest.fn();
        store.subscribe(undefined, listener);

        store.notify([]);

        expect(listener).not.toHaveBeenCalled();
    });
});
