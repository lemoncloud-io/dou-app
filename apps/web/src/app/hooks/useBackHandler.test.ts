import { renderHook } from '@testing-library/react';

import { useBackHandler } from './useBackHandler';

jest.mock('react-router-dom', () => ({
    useLocation: () => ({ pathname: '/', key: 'default' }),
}));
jest.mock('@chatic/shared', () => ({
    ...jest.requireActual('@chatic/shared'),
    useNavigateWithTransition: () => navigate,
}));
const mockBackGesture = { setCanGoBack: jest.fn() };
jest.mock('@chatic/runtime-react', () => {
    const { browserAppShell, fakeRuntimeModule } = require('@chatic/runtime-react/testing');
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
        for (let i = 0; i < 5; i++) window.dispatchEvent(new PopStateEvent('popstate'));
        withStackDepth(0);
    });

    it('rewinds when the app has an entry behind the current screen', () => {
        withStackDepth(2);

        pressBack();

        expect(navigate).toHaveBeenCalledWith(-1);
    });

    it('does nothing on the app first screen', () => {
        withStackDepth(0);

        pressBack();

        expect(navigate).not.toHaveBeenCalled();
    });

    it('reads the app depth rather than history.length', () => {
        jest.spyOn(window.history, 'length', 'get').mockReturnValue(7);

        withStackDepth(0);
        pressBack();
        expect(navigate).not.toHaveBeenCalled();

        withStackDepth(3);
        pressBack();
        expect(navigate).toHaveBeenCalledWith(-1);
    });

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

    describe('what the shell is told', () => {
        beforeEach(() => {
            isNativeValue = true;
        });

        it('reports a screen with an entry behind it as the page to spend', () => {
            withStackDepth(3);

            renderHook(() => useBackHandler());

            expect(mockBackGesture.setCanGoBack).toHaveBeenLastCalledWith(true);
        });

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

    it('names which branch it took', () => {
        withStackDepth(2);
        openDialog();
        expect(pressBack()).toBe('overlay-closed');

        document.body.innerHTML = '';
        expect(pressBack()).toBe('navigated');

        withStackDepth(0);
        expect(pressBack()).toBe('not-consumed');
    });

    it('closes a regular dialog with Escape', () => {
        withStackDepth(2);
        openDialog();
        const keydown = jest.fn();
        document.addEventListener('keydown', keydown);

        pressBack();

        expect(keydown).toHaveBeenCalledWith(expect.objectContaining({ key: 'Escape' }));
        document.removeEventListener('keydown', keydown);
    });

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
