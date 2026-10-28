import { clearInputLocks, useInputLockStore } from './useInputLockStore';

const locked = () => useInputLockStore.getState().locked;
const persisted = () => JSON.parse(localStorage.getItem('chatic.composer.inputLocks') ?? '{}').state?.locked;

beforeEach(() => {
    useInputLockStore.setState({ locked: {} });
    localStorage.clear();
});

describe('useInputLockStore', () => {
    it('keeps a lock per room and persists it on the device', () => {
        useInputLockStore.getState().setLocked('c1', true);
        useInputLockStore.getState().setLocked('c2', true);

        expect(locked()).toEqual({ c1: true, c2: true });
        expect(persisted()).toEqual({ c1: true, c2: true });
    });

    it('lets one room go without touching the others', () => {
        useInputLockStore.getState().setLocked('c1', true);
        useInputLockStore.getState().setLocked('c2', true);
        useInputLockStore.getState().setLocked('c1', false);

        expect(locked()).toEqual({ c2: true });
    });

    it('keeps the state when nothing changes', () => {
        useInputLockStore.getState().setLocked('c1', true);
        const before = useInputLockStore.getState();

        useInputLockStore.getState().setLocked('c1', true);
        useInputLockStore.getState().setLocked('c2', false);

        expect(useInputLockStore.getState()).toBe(before);
    });

    it('lets every lock go at sign-out', () => {
        useInputLockStore.getState().setLocked('c1', true);

        clearInputLocks();

        expect(locked()).toEqual({});
        expect(persisted()).toEqual({});
    });
});
