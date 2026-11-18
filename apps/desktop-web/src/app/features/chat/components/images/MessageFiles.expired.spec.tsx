import { beforeEach, describe, expect, it, vi } from 'vitest';

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';

import type { DomainChat } from '@chatic/data';
import { TooltipProvider } from '@chatic/ui-kit/components/ui/tooltip';

import { downloadImage } from '../../utils';
import type * as Utils from '../../utils';
import { resetImageAddressRefresh } from '../../hooks/useImageAddressRefresh';
import { MessageFiles } from './MessageFiles';

import '../../../../../i18n';

const getChat = vi.hoisted(() => vi.fn());

vi.mock('@chatic/app-runtime', () => ({
    runtime: {
        session: { getGlobalSessionContext: () => ({ cloud: { cloudId: 'cl-1', siteId: 's-1' } }) },
        data: { getCloudRepositories: () => ({ chat: { getChat } }) },
    },
}));

vi.mock('../../utils', async importOriginal => ({
    ...(await importOriginal<typeof Utils>()),
    downloadImage: vi.fn(),
}));

const wrapper = ({ children }: { children: ReactNode }) => <TooltipProvider>{children}</TooltipProvider>;
const author = { name: 'Ada', colorSeed: 'ada', time: '7:43 PM' };
const sent = (upload$$: unknown[]) => ({ id: 'row-1', channelId: 'ch-1', upload$$ }) as DomainChat;

// A message from yesterday: the addresses it was cached with are past their signature.
describe('MessageFiles with an expired signed address', () => {
    beforeEach(() => {
        cleanup();
        getChat.mockReset();
        vi.mocked(downloadImage).mockReset();
        resetImageAddressRefresh();
    });

    it('reads the message again when a video fails to load', async () => {
        getChat.mockResolvedValue(sent([]));
        render(
            <MessageFiles
                author={author}
                message={sent([{ id: 'v', stereo: 'video', name: 'clip.mp4', orgUrl: 'https://s/old' }])}
            />,
            { wrapper }
        );
        fireEvent.error(document.querySelector('video') as HTMLVideoElement);
        await waitFor(() => expect(getChat).toHaveBeenCalledWith({ id: 'row-1' }));
    });

    it('saves from the fresh address when the first one is refused', async () => {
        getChat.mockResolvedValue(
            sent([
                {
                    id: 'f',
                    stereo: 'file',
                    name: 'report.pdf',
                    contentType: 'application/pdf',
                    orgUrl: 'https://s/new',
                },
            ])
        );
        vi.mocked(downloadImage).mockImplementation(async ({ url }) => {
            if (url.endsWith('old')) throw new Error('file fetch failed: 403');
        });
        render(
            <MessageFiles
                author={author}
                message={sent([
                    {
                        id: 'f',
                        stereo: 'file',
                        name: 'report.pdf',
                        contentType: 'application/pdf',
                        orgUrl: 'https://s/old',
                    },
                ])}
            />,
            { wrapper }
        );
        fireEvent.click(screen.getByRole('button', { name: 'Save report.pdf' }));
        await waitFor(() => expect(downloadImage).toHaveBeenCalledWith({ url: 'https://s/new', name: 'report.pdf' }));
        expect(downloadImage).toHaveBeenCalledTimes(2);
    });
});
