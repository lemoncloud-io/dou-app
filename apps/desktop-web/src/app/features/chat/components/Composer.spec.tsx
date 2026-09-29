import { beforeEach, describe, expect, it, vi } from 'vitest';

import { act, fireEvent, render, screen } from '@testing-library/react';

import { TooltipProvider } from '@chatic/ui-kit/components/ui/tooltip';

import { useComposerDraftStore } from '../../../shared';
import type { ComposerAttachment } from '../hooks';
import { Composer } from './Composer';

import '../../../../i18n';

const picked = (): ComposerAttachment => {
    const file = new File(['a'], 'a.png', { type: 'image/png' });
    return { id: 'attachment-1', key: 'a.png:1:1', name: 'a.png', url: 'blob:a', file };
};

const renderComposer = (attachments: ComposerAttachment[], onSend = vi.fn()) => {
    render(
        <TooltipProvider>
            <Composer
                channelId="ch-1"
                onSend={onSend}
                attachments={attachments}
                onAddFiles={vi.fn()}
                onRemoveAttachment={vi.fn()}
            />
        </TooltipProvider>
    );
    return onSend;
};

const sendButton = () => screen.getByRole('button', { name: 'Send' });

beforeEach(() => {
    useComposerDraftStore.setState({ drafts: {} });
});

describe('Composer', () => {
    it('sends pictures on their own, with no text', async () => {
        const attachment = picked();
        const onSend = renderComposer([attachment]);

        await act(async () => fireEvent.click(sendButton()));

        expect(onSend).toHaveBeenCalledWith('', [attachment.file]);
    });

    it('hands the text and the files up together', async () => {
        useComposerDraftStore.setState({ drafts: { 'ch-1': 'caption' } });
        const attachment = picked();
        const onSend = renderComposer([attachment]);
        // The editor loads the channel's draft after it mounts.
        await screen.findByText('caption');

        await act(async () => fireEvent.click(sendButton()));

        expect(onSend).toHaveBeenCalledWith('caption', [attachment.file]);
    });

    it('sends nothing when there is neither text nor a picture', async () => {
        const onSend = renderComposer([]);

        expect((sendButton() as HTMLButtonElement).disabled).toBe(true);
        await act(async () => fireEvent.click(sendButton()));

        expect(onSend).not.toHaveBeenCalled();
    });
});
