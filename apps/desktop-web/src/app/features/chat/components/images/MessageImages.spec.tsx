import { describe, expect, it, vi } from 'vitest';

import { act, fireEvent, render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';

import type { DomainChat } from '@chatic/data';
import { TooltipProvider } from '@chatic/ui-kit/components/ui/tooltip';

import { MessageImages } from './MessageImages';

import '../../../../../i18n';

vi.mock('../../../channels', () => ({
    ConfirmDialog: ({
        title,
        confirmLabel,
        onConfirm,
    }: {
        title: string;
        confirmLabel: string;
        onConfirm: () => void;
    }) => (
        <div>
            <p>{title}</p>
            <button type="button" onClick={onConfirm}>
                {confirmLabel}
            </button>
        </div>
    ),
}));

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

        // Tile pictures are decorative (the button names them), so they are read off the DOM.
        const sources = () => Array.from(document.querySelectorAll('img')).map(img => img.getAttribute('src'));
        expect(sources()).toEqual(['https://s/t2']);

        await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Open image-2' })));

        expect(sources()).not.toContain('');
        expect(sources()).toContain('https://s/o2');
    });

    it('offers no "delete file" on a sent message when nothing can delete the message', async () => {
        render(
            <MessageImages
                message={sent([{ id: 'u1', status: 'stored', orgUrl: 'https://s/o1' }] as DomainChat['upload$$'])}
                canDelete
                author={author}
            />,
            { wrapper }
        );

        const more = screen.getByRole('button', { name: 'More actions' });
        fireEvent.pointerDown(more, { button: 0, ctrlKey: false });
        fireEvent.keyDown(more, { key: 'Enter' });
        expect(await screen.findByRole('menuitem', { name: /copy/i })).toBeTruthy();
        expect(screen.queryByRole('menuitem', { name: /delete/i })).toBeNull();
    });

    it('deletes the whole message from "delete file" on a sent upload', async () => {
        const onDeleteMessage = vi.fn();
        render(
            <MessageImages
                message={sent([{ id: 'u1', status: 'stored', orgUrl: 'https://s/o1' }] as DomainChat['upload$$'])}
                canDelete
                onDeleteMessage={onDeleteMessage}
                author={author}
            />,
            { wrapper }
        );

        const more = screen.getByRole('button', { name: 'More actions' });
        fireEvent.pointerDown(more, { button: 0, ctrlKey: false });
        fireEvent.keyDown(more, { key: 'Enter' });
        fireEvent.click(await screen.findByRole('menuitem', { name: /delete/i }));
        expect(await screen.findByText('Delete this message?')).toBeTruthy();
        fireEvent.click(screen.getByRole('button', { name: 'Delete file' }));
        expect(onDeleteMessage).toHaveBeenCalledTimes(1);
    });

    it('offers reply, copy link and forward on a sent image, as every file does', async () => {
        render(
            <MessageImages
                message={
                    {
                        ...sent([{ id: 'u1', status: 'stored', orgUrl: 'https://s/o1' }] as DomainChat['upload$$']),
                        chatNo: 3,
                    } as DomainChat
                }
                canDelete={false}
                author={author}
                onReply={vi.fn()}
            />,
            { wrapper }
        );

        const more = screen.getByRole('button', { name: 'More actions' });
        fireEvent.pointerDown(more, { button: 0, ctrlKey: false });
        fireEvent.keyDown(more, { key: 'Enter' });
        expect(await screen.findByRole('menuitem', { name: 'Reply in thread' })).toBeTruthy();
        expect(screen.getByRole('menuitem', { name: 'Copy link' })).toBeTruthy();
        expect(screen.getByRole('menuitem', { name: 'Forward' })).toBeTruthy();
    });
});
