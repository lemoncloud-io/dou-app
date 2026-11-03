import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';

import { SubWebViewLinkPage } from './SubWebViewLinkPage';

const replace = vi.fn();

// jsdom's location cannot be pointed at another host, so the page reads a stand-in.
const visit = (href: string) => {
    vi.stubGlobal('location', { href, replace });
    render(
        <MemoryRouter initialEntries={['/apps/x']}>
            <Routes>
                <Route path="/apps/*" element={<SubWebViewLinkPage />} />
                <Route path="/" element={<p>home</p>} />
            </Routes>
        </MemoryRouter>
    );
};

describe('SubWebViewLinkPage', () => {
    afterEach(() => {
        vi.unstubAllGlobals();
        replace.mockReset();
    });

    it.each([
        ['https://app.chatic.io/apps/quiz/level?x=1#top', 'https://quiz.apps.chatic.io/level?x=1#top'],
        ['https://app-dev.chatic.io/apps/sample', 'https://sample.apps-dev.chatic.io/'],
    ])('sends %s on to %s', (href, page) => {
        visit(href);

        expect(replace).toHaveBeenCalledWith(page);
    });

    it('goes home from a host it cannot map', () => {
        visit('http://localhost:5173/apps/quiz');

        expect(replace).not.toHaveBeenCalled();
        expect(screen.getByText('home')).toBeTruthy();
    });
});
