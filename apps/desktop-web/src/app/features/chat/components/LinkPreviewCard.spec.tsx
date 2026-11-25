import { beforeEach, describe, expect, it, vi } from 'vitest';

import { act, render, screen, waitFor } from '@testing-library/react';

const requestMock = vi.hoisted(() => vi.fn());
vi.mock('@chatic/runtime-react', async () => {
    const testing = await import('@chatic/runtime-react/testing');
    return testing.fakeRuntimeModule({
        links: { ...testing.browserLinks(), kind: 'shell', linkPreview: { fetch: requestMock } },
    });
});

import { LinkPreviewCard } from './LinkPreviewCard';

describe('LinkPreviewCard', () => {
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
        await waitFor(() => expect(requestMock).toHaveBeenCalledTimes(1));
        await act(async () => {
            await requestMock.mock.results[0]?.value;
        });

        expect(container.querySelector('a')).toBeNull();
    });
});
