import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { EMOJI_CATEGORIES, emojiNameKey } from './emoji';
import { QUICK_REACTIONS } from '../stores/useRecentEmojiStore';

const allEmojis = EMOJI_CATEGORIES.flatMap(cat => cat.emojis);

const readEmojiNames = (lang: string): Record<string, string> =>
    JSON.parse(readFileSync(join(__dirname, '../../../../../public/locales', lang, 'emoji.json'), 'utf-8'));

describe('emoji names — the `emoji` locale namespace', () => {
    it('emojiNameKey drops the presentation selector and keeps everything else', () => {
        expect(emojiNameKey('\u2639\uFE0F')).toBe('\u2639');
        expect(emojiNameKey('\u{1F9D1}\u200D\u{1F4BB}')).toBe('\u{1F9D1}\u200D\u{1F4BB}');
    });

    it.each(['ko', 'en'])('every curated emoji has a %s name', lang => {
        const names = readEmojiNames(lang);
        expect(allEmojis.filter(emoji => !names[emojiNameKey(emoji)])).toEqual([]);
    });
});

describe('EMOJI_CATEGORIES — 피커 큐레이션', () => {
    it('카테고리 키가 겹치지 않는다', () => {
        const keys = EMOJI_CATEGORIES.map(cat => cat.key);
        expect(new Set(keys).size).toBe(keys.length);
    });

    it('같은 이모지가 두 번 나오지 않는다', () => {
        const dupes = allEmojis.filter((e, i) => allEmojis.indexOf(e) !== i);
        expect(dupes).toEqual([]);
    });

    it('빈 카테고리가 없다', () => {
        for (const cat of EMOJI_CATEGORIES) {
            expect(cat.emojis.length).toBeGreaterThan(0);
        }
    });

    it('탭 아이콘은 자기 카테고리 안의 이모지다', () => {
        for (const cat of EMOJI_CATEGORIES) {
            expect(cat.emojis).toContain(cat.icon);
        }
    });

    it('QUICK_REACTIONS는 모두 큐레이션 안에 있다', () => {
        for (const emoji of QUICK_REACTIONS) {
            expect(allEmojis).toContain(emoji);
        }
    });

    it('스킨톤 변형을 담지 않는다', () => {
        const toned = allEmojis.filter(e => /[\u{1F3FB}-\u{1F3FF}]/u.test(e));
        expect(toned).toEqual([]);
    });
});
