import { renderHook } from '@testing-library/react';

import { appBridge } from '../bridge';
import { useBackHandler } from './useBackHandler';

jest.mock('react-router-dom', () => ({ useLocation: () => ({ pathname: '/', key: 'default' }) }));
jest.mock('@chatic/bridges', () => ({ isNative: () => isNativeValue }));
jest.mock('@chatic/shared', () => ({ useNavigateWithTransition: () => navigate }));
jest.mock('../bridge', () => ({
    appBridge: { setCanGoBack: jest.fn() },
    useOnBackPressed: jest.fn(),
}));

const navigate = jest.fn();
let isNativeValue = false;

/**
 * Sets the router index the back judgement reads. 0 is the app's first entry — nothing behind it —
 * and anything above it means a screen the user can return to.
 */
const withStackDepth = (depth: number) => window.history.pushState({ idx: depth }, '');

const openDialog = () => {
    const dialog = document.createElement('div');
    dialog.setAttribute('role', 'dialog');
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

    // What the shell is told, which is NOT yet the judgement above: `setCanGoBack` still reports
    // dialog state only, so the shell keeps OR-ing in the WebView's own history to decide whether to
    // exit. Pinned deliberately — the step that makes the web the single source of that answer has to
    // come back and change this expectation, and a silent divergence is what it is here to prevent.
    it('reports only dialog state to the shell, not the depth', () => {
        isNativeValue = true;
        withStackDepth(3);

        renderHook(() => useBackHandler());

        expect(appBridge.setCanGoBack).toHaveBeenCalledWith(false);

        jest.clearAllMocks();
        openDialog();
        renderHook(() => useBackHandler());

        expect(appBridge.setCanGoBack).toHaveBeenCalledWith(true);
    });
});
