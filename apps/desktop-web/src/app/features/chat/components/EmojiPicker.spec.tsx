import { beforeEach, describe, expect, it, vi } from 'vitest';

import { fireEvent, render, screen } from '@testing-library/react';
import i18next from 'i18next';

import { TooltipProvider } from '@chatic/ui-kit/components/ui/tooltip';

import { useRecentEmojiStore } from '../stores/useRecentEmojiStore';
import { EMOJI_CATEGORIES } from '../utils/emoji';
import { EmojiPicker } from './EmojiPicker';

import '../../../../i18n';

const setup = (onPick: (emoji: string) => void) => {
    render(
        <TooltipProvider>
            <EmojiPicker onPick={onPick} />
        </TooltipProvider>
    );
};

beforeEach(() => {
    useRecentEmojiStore.setState({ recent: ['😀'] });
});

describe('EmojiPicker', () => {
    it('names every category tab for assistive tech, not just the hover hint', async () => {
        setup(vi.fn());

        // The Hint tooltip is not read by assistive tech (see Hint.tsx) — the
        // tab itself has to carry the name.
        expect(await screen.findByRole('tab', { name: i18next.t('emoji.recent') })).toBeTruthy();
        for (const cat of EMOJI_CATEGORIES) {
            expect(screen.getByRole('tab', { name: i18next.t(`emoji.cat.${cat.key}`) })).toBeTruthy();
        }
    });

    it('picks an emoji from the grid', async () => {
        const onPick = vi.fn();
        setup(onPick);

        fireEvent.click(await screen.findByRole('button', { name: '😀' }));
        expect(onPick).toHaveBeenCalledWith('😀');
    });
});
