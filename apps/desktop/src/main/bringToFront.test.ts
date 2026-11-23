import { bringToFront, type FrontableWindow } from './bringToFront';

const fakeWindow = (minimized: boolean) => {
    const calls: string[] = [];
    const win: FrontableWindow = {
        isMinimized: () => minimized,
        restore: () => calls.push('restore'),
        show: () => calls.push('show'),
        focus: () => calls.push('focus'),
    };
    return { win, calls };
};

describe('bringToFront', () => {
    it('restores a minimized window before showing and focusing it', () => {
        const { win, calls } = fakeWindow(true);
        bringToFront(win);
        expect(calls).toEqual(['restore', 'show', 'focus']);
    });

    it('does not restore a window that is not minimized', () => {
        const { win, calls } = fakeWindow(false);
        bringToFront(win);
        expect(calls).toEqual(['show', 'focus']);
    });
});
