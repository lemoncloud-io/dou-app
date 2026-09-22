import { MENU_EXIT_TIMEOUT_MS, waitForMenuDismissal } from './menuDismissal';

/**
 * `MutationObserver` delivers on a microtask, so every assertion here has to let the queue drain
 * before reading the result. `settled` flips in a `then`, which is one microtask behind the
 * observer's own callback — awaiting twice is what puts this test after both.
 */
const drainMicrotasks = async () => {
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
};

const openMenu = () => {
    const menu = document.createElement('div');
    menu.setAttribute('role', 'menu');
    document.body.appendChild(menu);
    return menu;
};

describe('waitForMenuDismissal', () => {
    beforeEach(() => {
        jest.useFakeTimers();
        document.body.innerHTML = '';
    });

    afterEach(() => {
        jest.useRealTimers();
        document.body.innerHTML = '';
    });

    it('resolves immediately when no menu is open, so a plain navigation is not delayed', async () => {
        let settled = false;
        void waitForMenuDismissal().then(() => (settled = true));

        await drainMicrotasks();

        expect(settled).toBe(true);
    });

    it('holds while the menu is still mounted', async () => {
        openMenu();
        let settled = false;
        void waitForMenuDismissal().then(() => (settled = true));

        await drainMicrotasks();

        expect(settled).toBe(false);
    });

    it('resolves once the menu leaves the DOM', async () => {
        const menu = openMenu();
        let settled = false;
        void waitForMenuDismissal().then(() => (settled = true));

        await drainMicrotasks();
        expect(settled).toBe(false);

        menu.remove();
        await drainMicrotasks();

        expect(settled).toBe(true);
    });

    it('keeps holding while some other part of the page mutates', async () => {
        openMenu();
        let settled = false;
        void waitForMenuDismissal().then(() => (settled = true));

        document.body.appendChild(document.createElement('span'));
        await drainMicrotasks();

        expect(settled).toBe(false);
    });

    it('gives up at the ceiling rather than stranding a navigation behind a menu that never unmounts', async () => {
        openMenu();
        let settled = false;
        void waitForMenuDismissal().then(() => (settled = true));

        await drainMicrotasks();
        expect(settled).toBe(false);

        jest.advanceTimersByTime(MENU_EXIT_TIMEOUT_MS);
        await drainMicrotasks();

        expect(settled).toBe(true);
    });

    it('honours an overridden ceiling', async () => {
        openMenu();
        let settled = false;
        void waitForMenuDismissal({ timeoutMs: 50 }).then(() => (settled = true));

        jest.advanceTimersByTime(49);
        await drainMicrotasks();
        expect(settled).toBe(false);

        jest.advanceTimersByTime(1);
        await drainMicrotasks();
        expect(settled).toBe(true);
    });

    it('waits for a listbox too — a select closes on the same tap and lands in the same snapshot', async () => {
        const listbox = document.createElement('div');
        listbox.setAttribute('role', 'listbox');
        document.body.appendChild(listbox);
        let settled = false;
        void waitForMenuDismissal().then(() => (settled = true));

        await drainMicrotasks();
        expect(settled).toBe(false);

        listbox.remove();
        await drainMicrotasks();

        expect(settled).toBe(true);
    });

    it('resolves only once, so a late unmount after the ceiling cannot double-navigate', async () => {
        const menu = openMenu();
        let settleCount = 0;
        void waitForMenuDismissal().then(() => (settleCount += 1));

        jest.advanceTimersByTime(MENU_EXIT_TIMEOUT_MS);
        await drainMicrotasks();
        menu.remove();
        await drainMicrotasks();

        expect(settleCount).toBe(1);
    });
});
