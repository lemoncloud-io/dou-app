import { describe, expect, it } from 'vitest';

import { fireEvent, render, screen } from '@testing-library/react';
import { Toaster } from 'sonner';

import { SendToDou } from './SendToDou';

describe('SendToDou', () => {
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
