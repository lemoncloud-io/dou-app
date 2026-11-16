import { act, fireEvent, screen } from '@testing-library/react';

import { bootSplash } from './bootSplash';
import { showSessionOwnerUnsettled } from './sessionOwnerUnsettled';

jest.mock('./bootSplash', () => ({ bootSplash: { release: jest.fn() } }));
jest.mock('../../i18n', () => {
    const i18next = jest.requireActual('i18next');
    const instance = i18next.createInstance();
    void instance.init({ lng: 'en', resources: {} });
    return { __esModule: true, default: instance };
});

const setVisibility = (state: 'visible' | 'hidden') => {
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => state });
    document.dispatchEvent(new Event('visibilitychange'));
};

describe('showSessionOwnerUnsettled', () => {
    beforeEach(() => {
        document.body.innerHTML = '<div id="root"></div>';
        setVisibility('visible');
    });

    it('shows an error in place of the app, and lifts the boot cover', async () => {
        await act(async () => showSessionOwnerUnsettled({ attempts: 12, lastFailure: 'TIMEOUT' }, jest.fn()));

        expect(screen.getByRole('alert')).toBeTruthy();
        expect(screen.getByText(/TIMEOUT after 12 attempts/)).toBeTruthy();
        expect(bootSplash.release).toHaveBeenCalledWith('error');
    });

    it('starts over when its button is pressed', async () => {
        jest.useFakeTimers();
        const reload = jest.fn();
        await act(async () => showSessionOwnerUnsettled({ attempts: 3, lastFailure: 'TIMEOUT' }, reload));

        fireEvent.click(screen.getAllByRole('button')[0]);
        await act(async () => {
            jest.advanceTimersByTime(300);
        });

        expect(reload).toHaveBeenCalledTimes(1);
        jest.useRealTimers();
    });

    it('starts over by itself when the app comes back to the foreground, and not before', async () => {
        const reload = jest.fn();
        await act(async () => showSessionOwnerUnsettled({ attempts: 3, lastFailure: 'RUNTIME_STARTING' }, reload));

        setVisibility('visible');
        expect(reload).not.toHaveBeenCalled();
        setVisibility('hidden');
        setVisibility('visible');
        setVisibility('hidden');
        setVisibility('visible');

        expect(reload).toHaveBeenCalledTimes(1);
    });
});
