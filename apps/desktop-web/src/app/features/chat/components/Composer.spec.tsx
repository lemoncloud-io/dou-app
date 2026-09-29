import type { ReactNode } from 'react';
import { act, cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { TooltipProvider } from '@chatic/ui-kit/components/ui/tooltip';

import '../../../../i18n';

import { Composer } from './Composer';

const wrapper = ({ children }: { children: ReactNode }) => <TooltipProvider>{children}</TooltipProvider>;

// Lexical moves DOM focus after its own update cycle, a tick after mount.
const settle = () => act(() => new Promise(resolve => setTimeout(resolve, 100)));

describe('Composer autoFocus', () => {
    afterEach(cleanup);

    // Opening a thread left focus in the feed behind the panel.
    it('takes focus on mount when asked', async () => {
        const { container } = render(<Composer onSend={() => undefined} channelId="C1" autoFocus />, { wrapper });
        await settle();
        expect(document.activeElement).toBe(container.querySelector('[data-composer-input]'));
    });

    it('leaves focus alone otherwise', async () => {
        const { container } = render(<Composer onSend={() => undefined} channelId="C2" />, { wrapper });
        await settle();
        expect(document.activeElement).not.toBe(container.querySelector('[data-composer-input]'));
    });

    // A thread can open seconds after the click, once its channel loads; by then the reader
    // may be typing in the channel's composer.
    it('does not take focus from a field the reader is typing in', async () => {
        const field = document.createElement('input');
        document.body.appendChild(field);
        field.focus();
        render(<Composer onSend={() => undefined} channelId="C3" autoFocus />, { wrapper });
        await settle();
        expect(document.activeElement).toBe(field);
        field.remove();
    });
});
