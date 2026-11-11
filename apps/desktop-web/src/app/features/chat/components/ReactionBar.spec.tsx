import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { TooltipProvider } from '@chatic/ui-kit/components/ui/tooltip';

import { ReactionBar } from './ReactionBar';

// The `emoji` namespace names 👍 only, so 💯 stands in for a reaction from outside the curation.
const EMOJI_NAMES: Record<string, string> = { '👍': 'thumbs up' };
vi.mock('react-i18next', () => ({
    useTranslation: (ns?: string) => ({
        t: (key: string, options?: { defaultValue?: string }) =>
            ns === 'emoji' ? (EMOJI_NAMES[key] ?? options?.defaultValue ?? key) : key,
    }),
}));

const hoverHint = (emoji: string) => {
    render(
        <TooltipProvider delayDuration={APP_DELAY_MS}>
            <ReactionBar
                tallies={[{ emoji, userIds: ['u1'], mine: false }]}
                nameOf={() => 'Aiden'}
                onToggle={() => undefined}
            />
        </TooltipProvider>
    );
    fireEvent.pointerMove(screen.getByRole('button'));
    act(() => {
        vi.advanceTimersByTime(APP_DELAY_MS);
    });
    return screen.getByRole('tooltip').textContent;
};

// The app-wide provider delay (DesktopRuntime). A native `title` ignores it and waits
// on the browser's own timer, which restarts on every mouse move.
const APP_DELAY_MS = 300;

describe('ReactionBar', () => {
    beforeEach(() => vi.useFakeTimers());
    afterEach(() => vi.useRealTimers());

    it('names the reactors on hover within the app tooltip delay', () => {
        expect(hoverHint('💯')).toBe('Aiden');
    });

    it("heads the hint with the emoji's own name when it has one", () => {
        expect(hoverHint('👍')).toBe('thumbs up\nAiden');
    });
});
