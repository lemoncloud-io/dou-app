import { describe, expect, it, vi } from 'vitest';

import { render } from '@testing-library/react';

import { RouteFallback } from './RouteFallback';

vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }));
vi.mock('@chatic/shared', () => ({ LoadingFallback: () => <div data-testid="plain-loader" /> }));

const shellOf = (container: HTMLElement) => container.querySelector('[data-shell-sidebar]');
const pageOf = (container: HTMLElement) => container.querySelector('[data-page-skeleton]');

describe('RouteFallback', () => {
    it('draws the chat shell only for the home route', () => {
        const { container } = render(<RouteFallback pathname="/" isAuthenticated />);

        expect(shellOf(container)).not.toBeNull();
        expect(pageOf(container)).toBeNull();
    });

    it.each(['/settings', '/profile', '/account/clouds/c1', '/places/p1/settings'])(
        'draws a page-shaped placeholder, not the chat shell, for %s',
        pathname => {
            const { container } = render(<RouteFallback pathname={pathname} isAuthenticated />);

            expect(pageOf(container)).not.toBeNull();
            expect(shellOf(container)).toBeNull();
        }
    );

    it('keeps the plain loader for a signed-out person whatever the route', () => {
        const { getByTestId, container } = render(<RouteFallback pathname="/" isAuthenticated={false} />);

        expect(getByTestId('plain-loader')).toBeTruthy();
        expect(shellOf(container)).toBeNull();
    });
});
