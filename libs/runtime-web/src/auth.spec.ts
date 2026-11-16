import { webAuthPorts } from './auth';

import type { PageLocation } from './auth';

const pageAt = (search: string): PageLocation & { replace: jest.Mock } => ({
    search,
    origin: 'https://app.example.test',
    replace: jest.fn(),
});

describe('webAuthPorts', () => {
    it("reads the address's query string", () => {
        expect(webAuthPorts(pageAt('?logout=1&x=2')).currentSearch()).toBe('?logout=1&x=2');
    });

    it("reads the page's own location when none is handed in", () => {
        window.history.replaceState({}, '', '/somewhere?logout=1');

        expect(webAuthPorts().currentSearch()).toBe('?logout=1');
    });

    it('replaces the document with the home page carrying the given parameters', () => {
        const page = pageAt('?code=c');

        webAuthPorts(page).leaveToHome(
            new URLSearchParams([
                ['code', 'c'],
                ['logout', '1'],
            ])
        );

        expect(page.replace).toHaveBeenCalledWith('https://app.example.test/?code=c&logout=1');
    });
});
