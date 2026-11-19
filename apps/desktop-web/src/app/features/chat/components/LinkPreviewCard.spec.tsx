import { beforeEach, describe, expect, it, vi } from 'vitest';

import { act, render, screen, waitFor } from '@testing-library/react';

// The card only talks to the shell: the `links` port's preview reader returns the
// unfurled metadata. Faking it lets the test drive whatever the shell "found" for a URL.
const requestMock = vi.hoisted(() => vi.fn());
vi.mock('@chatic/runtime', async () => {
    const testing = await import('@chatic/runtime/testing');
    return testing.fakeRuntimeModule({
        links: { ...testing.browserLinks(), kind: 'shell', linkPreview: { fetch: requestMock } },
    });
});

import { LinkPreviewCard } from './LinkPreviewCard';

// The module-level metadata cache is not exported and persists for the whole
// file, so every test uses its own URL rather than trying to reset it.
describe('LinkPreviewCard', () => {
    // The vitest config sets no clearMocks, so call history would otherwise carry
    // across tests — and a `toHaveBeenCalled` assertion would then be satisfied by
    // an earlier test's call before this one's request had even resolved.
    beforeEach(() => {
        requestMock.mockReset();
    });

    it('renders no <img> even when the shell supplies an og:image URL', async () => {
        requestMock.mockResolvedValue({
            success: true,
            url: 'https://example.com/with-image',
            title: 'Has an og:image',
            siteName: 'Example',
            imageUrl: 'https://cdn.example.com/og.png',
        });

        const { container } = render(<LinkPreviewCard url="https://example.com/with-image" />);
        await screen.findByRole('link');

        // The chip deliberately drops the thumbnail: rendering it would make the
        // reader's browser hit that third-party host, handing it their IP,
        // user-agent and the moment they read the message. Prose in the
        // component can't enforce that — this assertion can.
        expect(container.querySelector('img')).toBeNull();
    });

    it('shows the source name and the title as the link text', async () => {
        requestMock.mockResolvedValue({
            success: true,
            url: 'https://example.com/report',
            title: 'Quarterly report',
            siteName: 'Example Docs',
        });

        render(<LinkPreviewCard url="https://example.com/report" />);
        const link = await screen.findByRole('link');

        expect(link.textContent).toContain('Example Docs');
        expect(link.textContent).toContain('Quarterly report');
    });

    it('renders nothing when the shell finds no usable metadata', async () => {
        requestMock.mockResolvedValue({ success: false });

        const { container } = render(<LinkPreviewCard url="https://example.com/empty" />);
        // This card renders null both before and after the shell answers, so waiting
        // on the DOM would prove nothing. Wait for the effect's request, then flush
        // the state update it resolves into, and only then assert on the absence.
        await waitFor(() => expect(requestMock).toHaveBeenCalledTimes(1));
        await act(async () => {
            await requestMock.mock.results[0]?.value;
        });

        expect(container.querySelector('a')).toBeNull();
    });
});
