import { afterEach, describe, expect, it } from 'vitest';

import { cleanup, fireEvent, render, screen } from '@testing-library/react';

import { TooltipProvider } from '@chatic/ui-kit/components/ui/tooltip';

import { Hint } from './Hint';

const renderHint = () =>
    render(
        <TooltipProvider delayDuration={0}>
            <button type="button">before</button>
            <Hint label="Search messages">
                <button type="button">search</button>
            </Hint>
        </TooltipProvider>
    );

describe('Hint', () => {
    afterEach(cleanup);

    it('shows on focus that arrives from another control', () => {
        renderHint();
        fireEvent.focus(screen.getByText('search'), { relatedTarget: screen.getByText('before') });

        expect(screen.getByRole('tooltip').textContent).toBe('Search messages');
    });

    // A closing dialog hands focus back to its opener after its own content is gone, so the
    // focus comes from nothing. The hint opened on that and sat over the control just used.
    it('stays shut when focus is handed back from nowhere', () => {
        renderHint();
        fireEvent.focus(screen.getByText('search'), { relatedTarget: null });

        expect(screen.queryByRole('tooltip')).toBeNull();
    });
});
