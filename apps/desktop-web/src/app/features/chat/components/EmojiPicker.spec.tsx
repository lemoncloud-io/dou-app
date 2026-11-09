import { beforeEach, describe, expect, it, vi } from 'vitest';

import { fireEvent, render, screen } from '@testing-library/react';
import i18next from 'i18next';

import { TooltipProvider } from '@chatic/ui-kit/components/ui/tooltip';

import { emojiNames } from '../../../../locales/emoji/ko';
import { useRecentEmojiStore } from '../stores/useRecentEmojiStore';
import { EMOJI_CATEGORIES, emojiNameKey } from '../utils/emoji';
import { EmojiPicker } from './EmojiPicker';

import '../../../../i18n';

const emojiName = (emoji: string) => i18next.t(emojiNameKey(emoji), { ns: 'emoji' });

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

        fireEvent.click(await screen.findByRole('button', { name: emojiName('😀') }));
        expect(onPick).toHaveBeenCalledWith('😀');
    });

    it('names each emoji in the current language, for assistive tech and the hover hint', async () => {
        await i18next.changeLanguage('ko');
        try {
            setup(vi.fn());
            const button = await screen.findByRole('button', { name: emojiNames['😀'] });
            expect(button.textContent).toBe('😀');

            // Radix opens the tooltip from pointer movement, not from a synthetic `mouseenter`.
            fireEvent.pointerMove(button);
            expect((await screen.findByRole('tooltip')).textContent).toBe(emojiNames['😀']);
        } finally {
            await i18next.changeLanguage('en');
        }
    });

    it('leaves an emoji with no name to its glyph instead of a blank label', async () => {
        // Not in the curation, so not in the generated tables — e.g. an old pick kept in recents.
        useRecentEmojiStore.setState({ recent: ['🫨'] });
        setup(vi.fn());

        expect(await screen.findByRole('button', { name: '🫨' })).toBeTruthy();
    });

    it('opens on the recently used tab when there is something recent', async () => {
        setup(vi.fn());

        const recentTab = await screen.findByRole('tab', { name: i18next.t('emoji.recent') });
        expect(recentTab.getAttribute('aria-selected')).toBe('true');
    });

    it('opens on the first category when nothing has been used yet', async () => {
        useRecentEmojiStore.setState({ recent: [] });
        setup(vi.fn());

        const first = await screen.findByRole('tab', { name: i18next.t(`emoji.cat.${EMOJI_CATEGORIES[0].key}`) });
        expect(first.getAttribute('aria-selected')).toBe('true');
    });
});
