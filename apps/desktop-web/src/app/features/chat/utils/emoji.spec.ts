import { describe, expect, it } from 'vitest';

import { emojiNames as en } from '../../../../locales/emoji/en';
import { emojiNames as ko } from '../../../../locales/emoji/ko';
import { EMOJI_CATEGORIES, emojiNameKey } from './emoji';

const allEmojis = EMOJI_CATEGORIES.flatMap(cat => cat.emojis);

describe('emojiNameKey', () => {
    it('drops the presentation selector and keeps everything else', () => {
        expect(emojiNameKey('\u2639\uFE0F')).toBe('\u2639');
        expect(emojiNameKey('\u{1F9D1}\u200D\u{1F4BB}')).toBe('\u{1F9D1}\u200D\u{1F4BB}');
    });
});

describe('emoji name tables', () => {
    // A curated emoji with no name gets no hover hint. After adding to the curation, regenerate
    // the tables with `yarn generate:emoji-names`.
    it.each([
        ['ko', ko],
        ['en', en],
    ])('every curated emoji has a %s name', (_lang, names) => {
        expect(allEmojis.filter(emoji => !names[emojiNameKey(emoji)])).toEqual([]);
    });
});
