import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@chatic/app-runtime', () => ({
    runtime: { session: { useSessionIdentity: () => ({ userId: 'u1' }) } },
}));

import { useOnboardingStore } from '../stores';
import { OnboardingDialog } from './OnboardingDialog';

// Initialises i18next so the dialog copy resolves.
import '../../../../i18n';

const mount = () => render(<OnboardingDialog enabled showChannelStatus={false} isChannelReady={false} />);

describe('OnboardingDialog', () => {
    afterEach(() => {
        localStorage.clear();
        useOnboardingStore.setState({ checkedFor: null, reopenRequested: false });
    });

    // The home screen remounts on every return from Profile; closed tips came back each time.
    it('stays closed after a dismissal when the home screen remounts', () => {
        const first = mount();
        expect(screen.getByRole('dialog')).toBeTruthy();
        fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });
        first.unmount();

        mount();
        expect(screen.queryByRole('dialog')).toBeNull();
    });

    it('opens once for a reopen from Settings, not on every later mount', () => {
        localStorage.setItem('chatic.desktop.onboarded:u1', '1');
        act(() => useOnboardingStore.getState().reopen());
        const first = mount();
        expect(screen.getByRole('dialog')).toBeTruthy();
        first.unmount();

        mount();
        expect(screen.queryByRole('dialog')).toBeNull();
    });
});

// A dismissal used to survive only in memory, so every page reload — the wedge
// self-heal after sleep, a restart, a manual refresh — brought the tips back.
describe('OnboardingDialog after a reload', () => {
    // A page load starts with empty stores and whatever localStorage kept, so the
    // precondition is set here rather than inherited from the suite above.
    beforeEach(() => {
        localStorage.clear();
        useOnboardingStore.setState({ checkedFor: null, reopenRequested: false });
    });

    it('stays closed after the person closed it and the page reloaded', () => {
        const first = mount();
        fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });
        first.unmount();

        // A reload keeps localStorage and drops every in-memory store.
        useOnboardingStore.setState({ checkedFor: null, reopenRequested: false });

        mount();
        expect(screen.queryByRole('dialog')).toBeNull();
    });
});
