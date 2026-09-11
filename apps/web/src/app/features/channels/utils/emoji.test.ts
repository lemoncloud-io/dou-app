import { EMOJI_CATEGORIES } from './emoji';
import { QUICK_REACTIONS } from '../stores/useRecentEmojiStore';

const allEmojis = EMOJI_CATEGORIES.flatMap(cat => cat.emojis);

describe('EMOJI_CATEGORIES — 피커 큐레이션', () => {
    it('카테고리 키가 겹치지 않는다', () => {
        const keys = EMOJI_CATEGORIES.map(cat => cat.key);
        expect(new Set(keys).size).toBe(keys.length);
    });

    // 같은 이모지가 두 탭에 있으면 사용자는 방금 본 걸 다른 탭에서 또 보고, 어느 탭이
    // 그 이모지의 집인지 배울 수 없다.
    it('같은 이모지가 두 번 나오지 않는다', () => {
        const dupes = allEmojis.filter((e, i) => allEmojis.indexOf(e) !== i);
        expect(dupes).toEqual([]);
    });

    it('빈 카테고리가 없다', () => {
        for (const cat of EMOJI_CATEGORIES) {
            expect(cat.emojis.length).toBeGreaterThan(0);
        }
    });

    // 탭 아이콘은 그 탭이 무엇을 담는지 말한다 — 자기 카테고리 안에 있는 글리프여야
    // 아이콘과 내용이 어긋나지 않는다.
    it('탭 아이콘은 자기 카테고리 안의 이모지다', () => {
        for (const cat of EMOJI_CATEGORIES) {
            expect(cat.emojis).toContain(cat.icon);
        }
    });

    // 액션 시트의 원탭 리액션은 피커에서도 찾을 수 있어야 한다. 큐레이션에서 빠지면
    // 시트로만 보낼 수 있고 피커로는 되돌릴 수 없는 이모지가 생긴다.
    it('QUICK_REACTIONS는 모두 큐레이션 안에 있다', () => {
        for (const emoji of QUICK_REACTIONS) {
            expect(allEmojis).toContain(emoji);
        }
    });

    // 스킨톤 수정자(U+1F3FB..U+1F3FF)는 넣지 않는다 — 한 이모지가 5배로 불어나고,
    // 서버의 fold 키는 수정자를 지우지 않으므로 같은 리액션이 여러 칩으로 쪼개진다.
    it('스킨톤 변형을 담지 않는다', () => {
        const toned = allEmojis.filter(e => /[\u{1F3FB}-\u{1F3FF}]/u.test(e));
        expect(toned).toEqual([]);
    });
});
