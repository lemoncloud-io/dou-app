import { describe, expect, it } from 'vitest';

import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';

import { PageShell } from './PageShell';

const renderAt = (actions?: React.ReactNode) =>
    render(
        <MemoryRouter initialEntries={['/me']}>
            <Routes>
                <Route
                    path="/me"
                    element={
                        <PageShell title="Account" backTo="/settings" backLabel="Settings" actions={actions}>
                            body
                        </PageShell>
                    }
                />
                <Route path="/settings" element={<div data-testid="settings" />} />
            </Routes>
        </MemoryRouter>
    );

describe('PageShell', () => {
    it('names the back target after its parent and goes there', () => {
        renderAt();

        expect(screen.getByRole('heading', { name: 'Account' })).toBeTruthy();
        fireEvent.click(screen.getByRole('button', { name: 'Settings' }));

        expect(screen.getByTestId('settings')).toBeTruthy();
    });

    it('draws the body in a main landmark', () => {
        renderAt();

        expect(screen.getByRole('main').textContent).toContain('body');
    });

    it('draws header actions after the title', () => {
        renderAt(<span>autosave note</span>);

        expect(screen.getByText('autosave note')).toBeTruthy();
    });
});
