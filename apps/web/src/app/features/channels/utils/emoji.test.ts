import { EMOJI_CATEGORIES } from './emoji';
import { QUICK_REACTIONS } from '../stores/useRecentEmojiStore';

const allEmojis = EMOJI_CATEGORIES.flatMap(cat => cat.emojis);

describe('EMOJI_CATEGORIES — 피커 큐레이션', () => {
    it('카테고리 키가 겹치지 않는다', () => {
        const keys = EMOJI_CATEGORIES.map(cat => cat.key);
        expect(new Set(keys).size).toBe(keys.length);
    });

    // If the same emoji appears in two tabs, the user sees what they just saw again in another
    // tab, and can never learn which tab is that emoji's home.
    it('같은 이모지가 두 번 나오지 않는다', () => {
        const dupes = allEmojis.filter((e, i) => allEmojis.indexOf(e) !== i);
        expect(dupes).toEqual([]);
    });

    it('빈 카테고리가 없다', () => {
        for (const cat of EMOJI_CATEGORIES) {
            expect(cat.emojis.length).toBeGreaterThan(0);
        }
    });

    // A tab's icon tells you what that tab holds — it has to be a glyph from within its own
    // category, or the icon and the content disagree.
    it('탭 아이콘은 자기 카테고리 안의 이모지다', () => {
        for (const cat of EMOJI_CATEGORIES) {
            expect(cat.emojis).toContain(cat.icon);
        }
    });

    // A one-tap reaction from the action sheet must also be findable in the picker. If it's
    // missing from the curated set, there'd be an emoji you can send from the sheet but can
    // never toggle back off from the picker.
    it('QUICK_REACTIONS는 모두 큐레이션 안에 있다', () => {
        for (const emoji of QUICK_REACTIONS) {
            expect(allEmojis).toContain(emoji);
        }
    });

    // Skin-tone modifiers (U+1F3FB..U+1F3FF) are excluded — one emoji would balloon into five,
    // and since the server's fold key doesn't strip the modifier, the same reaction would split
    // across multiple chips.
    it('스킨톤 변형을 담지 않는다', () => {
        const toned = allEmojis.filter(e => /[\u{1F3FB}-\u{1F3FF}]/u.test(e));
        expect(toned).toEqual([]);
    });
});
