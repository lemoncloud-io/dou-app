import { describe, expect, it } from 'vitest';

import { fireEvent, render, screen } from '@testing-library/react';
import { Toaster } from 'sonner';

import { SendToDou } from './SendToDou';

describe('SendToDou', () => {
    // The button is drawn before the endpoint exists, so the one thing it must
    // never do is look like it sent something. If this test starts failing
    // because the toast changed, the send is probably now real — delete it and
    // pin what the send actually does instead.
    it('says it is not connected rather than reporting a send', async () => {
        render(
            <>
                <SendToDou />
                <Toaster />
            </>
        );
        fireEvent.click(screen.getByRole('button', { name: 'Send to DoU' }));
        expect(await screen.findByText('Send to DoU is not connected yet')).not.toBeNull();
    });
});
