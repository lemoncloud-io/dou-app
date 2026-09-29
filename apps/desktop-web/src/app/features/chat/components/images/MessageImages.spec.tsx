import { describe, expect, it, vi } from 'vitest';

import { act, fireEvent, render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';

import type { DomainChat } from '@chatic/data';
import { TooltipProvider } from '@chatic/ui-kit/components/ui/tooltip';

import { MessageImages } from './MessageImages';

import '../../../../../i18n';

vi.mock('../../../channels', () => ({ ConfirmDialog: () => null }));

const wrapper = ({ children }: { children: ReactNode }) => <TooltipProvider>{children}</TooltipProvider>;

const sent = (upload$$: DomainChat['upload$$']) => ({ id: 'row-1', channelId: 'ch-1', upload$$ }) as DomainChat;

const author = { name: 'Me', time: '10:00' };

describe('MessageImages', () => {
    it('draws no broken image for an upload that failed, and opens the viewer on the ones that load', async () => {
        render(
            <MessageImages
                message={sent([
                    { id: 'u1', status: 'failed' },
                    { id: 'u2', status: 'stored', orgUrl: 'https://s/o2', thumbUrl: 'https://s/t2' },
                ] as DomainChat['upload$$'])}
                canDelete
                author={author}
            />,
            { wrapper }
        );

        const sources = () => screen.queryAllByRole('img', { hidden: true }).map(img => img.getAttribute('src'));
        expect(sources()).toEqual(['https://s/t2']);

        await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Open image-2' })));

        expect(sources()).not.toContain('');
        expect(sources()).toContain('https://s/o2');
    });

    it('offers no "delete file" on a sent message — there is no server delete for an upload', async () => {
        render(
            <MessageImages
                message={sent([{ id: 'u1', status: 'stored', orgUrl: 'https://s/o1' }] as DomainChat['upload$$'])}
                canDelete
                author={author}
            />,
            { wrapper }
        );

        await act(async () => fireEvent.keyDown(screen.getByRole('button', { name: /more/i }), { key: 'Enter' }));

        expect(await screen.findByRole('menuitem', { name: /copy/i })).toBeTruthy();
        expect(screen.queryByRole('menuitem', { name: /delete/i })).toBeNull();
    });
});
