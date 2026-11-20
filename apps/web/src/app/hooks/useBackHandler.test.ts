import { renderHook } from '@testing-library/react';

import { useBackHandler } from './useBackHandler';

// The rewind is reached through `useStackBack`, which this hook delegates its judgement to; the real
// router is not stood up here because the judgement has its own suite.
jest.mock('react-router-dom', () => ({
    useLocation: () => ({ pathname: '/', key: 'default' }),
}));
jest.mock('@chatic/shared', () => ({
    ...jest.requireActual('@chatic/shared'),
    useNavigateWithTransition: () => navigate,
}));
// The frame's back gesture, as the host's `appShell` port offers it; a browser's back is its own.
// One object for the whole suite, as the port is one value per start.
const mockBackGesture = { setCanGoBack: jest.fn() };
jest.mock('@chatic/runtime', () => {
    const { browserAppShell, fakeRuntimeModule } = require('@chatic/runtime/testing');
    return fakeRuntimeModule({
        get appShell() {
            return { ...browserAppShell(), backGesture: isNativeValue ? mockBackGesture : null };
        },
    });
});
jest.mock('../bridge', () => ({
    useOnBackPressed: jest.fn(),
}));

const navigate = jest.fn((_to: number) => Promise.resolve());
let isNativeValue = false;

/**
 * Sets the router index the back judgement reads. 0 is the app's first entry — nothing behind it —
 * and anything above it means a screen the user can return to.
 */
const withStackDepth = (depth: number) => window.history.pushState({ idx: depth }, '');

const openDialog = (role: 'dialog' | 'alertdialog' = 'dialog') => {
    const dialog = document.createElement('div');
    dialog.setAttribute('role', role);
    dialog.setAttribute('data-state', 'open');
    document.body.appendChild(dialog);
    return dialog;
};

const pressBack = () => renderHook(() => useBackHandler()).result.current.handleNativeBack();

describe('useBackHandler — the back press judgement', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        jest.restoreAllMocks();
        document.body.innerHTML = '';
        isNativeValue = false;
        // Lands any rewind an earlier case left in flight, so each case reads the depth it set.
        for (let i = 0; i < 5; i++) window.dispatchEvent(new PopStateEvent('popstate'));
        withStackDepth(0);
    });

    it('rewinds when the app has an entry behind the current screen', () => {
        withStackDepth(2);

        pressBack();

        expect(navigate).toHaveBeenCalledWith(-1);
    });

    // The app's first screen. Doing nothing is what lets the shell decide to exit; rewinding here
    // would leave the app on a history entry it does not own.
    it('does nothing on the app first screen', () => {
        withStackDepth(0);

        pressBack();

        expect(navigate).not.toHaveBeenCalled();
    });

    // The regression anchor for this change, in both directions. `history.length` grows for the life
    // of the WebView, so the old `history.length > 1` check said "go back" on a first screen; and the
    // old `location.key !== 'default'` half refused on a reload landing mid-stack, where going back
    // IS what the user wants. `useLocation` is mocked to key 'default' for the whole file, so if a
    // key check is ever reintroduced the second half of this case fails.
    it('reads the app depth rather than history.length', () => {
        jest.spyOn(window.history, 'length', 'get').mockReturnValue(7);

        withStackDepth(0);
        pressBack();
        expect(navigate).not.toHaveBeenCalled();

        withStackDepth(3);
        pressBack();
        expect(navigate).toHaveBeenCalledWith(-1);
    });

    // Overlay first, stack second — the order is unchanged by this commit and worth pinning, since
    // the depth check now sits where an easy mistake would be to run it first.
    it('closes an open dialog instead of rewinding', () => {
        withStackDepth(2);
        openDialog();

        pressBack();

        expect(navigate).not.toHaveBeenCalled();
    });

    it('leaves a dialog marked data-prevent-back-close alone and still does not rewind', () => {
        withStackDepth(2);
        openDialog().setAttribute('data-prevent-back-close', '');

        pressBack();

        expect(navigate).not.toHaveBeenCalled();
    });

    // What the shell is told is the judgement above, history included: the shell decides from it alone,
    // so a press on the first screen is the shell's (it may exit) and one on a pushed screen is ours.
    describe('what the shell is told', () => {
        beforeEach(() => {
            isNativeValue = true;
        });

        it('reports a screen with an entry behind it as the page to spend', () => {
            withStackDepth(3);

            renderHook(() => useBackHandler());

            expect(mockBackGesture.setCanGoBack).toHaveBeenLastCalledWith(true);
        });

        // The regression this report exists for: after the sign-in by code rewinds two entries, the app
        // is on its first screen, and a press there must go to the shell rather than be dropped here.
        it('reports the first screen as the shell to spend', () => {
            withStackDepth(0);

            renderHook(() => useBackHandler());

            expect(mockBackGesture.setCanGoBack).toHaveBeenLastCalledWith(false);
        });

        it('reports an open dialog as the page to spend, even on the first screen', () => {
            withStackDepth(0);
            openDialog();

            renderHook(() => useBackHandler());

            expect(mockBackGesture.setCanGoBack).toHaveBeenLastCalledWith(true);
        });

        // A rewind lands later; until it does, a quick second press on the screen it is going to must
        // already be the shell's, so the report goes out with the press rather than with the landing.
        it('reports again at once after a rewind, counting the rewind in flight', () => {
            withStackDepth(1);
            const { result } = renderHook(() => useBackHandler());
            jest.clearAllMocks();

            expect(result.current.handleNativeBack()).toBe('navigated');

            expect(mockBackGesture.setCanGoBack).toHaveBeenLastCalledWith(false);
        });

        it('tells nothing to a frame with no back gesture', () => {
            isNativeValue = false;
            withStackDepth(3);

            renderHook(() => useBackHandler());

            expect(mockBackGesture.setCanGoBack).not.toHaveBeenCalled();
        });
    });

    // The outcome is the point of this refactor: the third branch used to be an unnamed early
    // return, and the shell had to guess what it meant.
    it('names which branch it took', () => {
        withStackDepth(2);
        openDialog();
        expect(pressBack()).toBe('overlay-closed');

        document.body.innerHTML = '';
        expect(pressBack()).toBe('navigated');

        withStackDepth(0);
        expect(pressBack()).toBe('not-consumed');
    });

    // A regular dialog is closed by Escape, which Radix listens for at the document level.
    it('closes a regular dialog with Escape', () => {
        withStackDepth(2);
        openDialog();
        const keydown = jest.fn();
        document.addEventListener('keydown', keydown);

        pressBack();

        expect(keydown).toHaveBeenCalledWith(expect.objectContaining({ key: 'Escape' }));
        document.removeEventListener('keydown', keydown);
    });

    // An alertdialog deliberately ignores Escape — it wants an explicit choice — so the press is
    // delivered to its first button instead.
    it('clicks the first button of an alertdialog instead', () => {
        withStackDepth(2);
        const dialog = openDialog('alertdialog');
        const button = document.createElement('button');
        const onClick = jest.fn();
        button.addEventListener('click', onClick);
        dialog.appendChild(button);

        expect(pressBack()).toBe('overlay-closed');
        expect(onClick).toHaveBeenCalled();
        expect(navigate).not.toHaveBeenCalled();
    });
});
