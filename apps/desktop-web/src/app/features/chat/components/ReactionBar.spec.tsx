import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { TooltipProvider } from '@chatic/ui-kit/components/ui/tooltip';

import { ReactionBar } from './ReactionBar';

vi.mock('react-i18next', () => ({
    useTranslation: () => ({ t: (key: string) => key }),
}));

// The app-wide provider delay (DesktopRuntime). A native `title` ignores it and waits
// on the browser's own timer, which restarts on every mouse move.
const APP_DELAY_MS = 300;

describe('ReactionBar', () => {
    beforeEach(() => vi.useFakeTimers());
    afterEach(() => vi.useRealTimers());

    it('names the reactors on hover within the app tooltip delay', () => {
        render(
            <TooltipProvider delayDuration={APP_DELAY_MS}>
                <ReactionBar
                    tallies={[{ emoji: '💯', userIds: ['u1'], mine: false }]}
                    nameOf={() => 'Aiden'}
                    onToggle={() => undefined}
                />
            </TooltipProvider>
        );

        fireEvent.pointerMove(screen.getByRole('button'));
        act(() => {
            vi.advanceTimersByTime(APP_DELAY_MS);
        });

        expect(screen.getByRole('tooltip').textContent).toBe('Aiden');
    });
});
