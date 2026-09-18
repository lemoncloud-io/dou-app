import { DEBUG_MENU_SECTIONS, DEBUG_SCREENS, DEBUG_TABS } from './screenManifest';
import { DEBUG_LOCALE_TABLES } from '../i18n';
import { DEBUG_SCREEN_ICONS } from './screenIcons';
import { DEBUG_SCREEN_COMPONENTS } from './screenRegistry';

describe('screenManifest — 화면 카탈로그 단일화', () => {
    it('키가 유일하다', () => {
        const keys = DEBUG_SCREENS.map(screen => screen.key);
        expect(new Set(keys).size).toBe(keys.length);
    });

    // What having a single catalog actually means: there can be neither a screen missing from the menu nor a menu item missing from the registry.
    it('메뉴는 모든 화면을 한 번씩만 담고, 레지스트리와 짝이 맞는다', () => {
        const menuKeys = DEBUG_MENU_SECTIONS.flatMap(section => section.items.map(item => item.key));
        expect(menuKeys.sort()).toEqual(DEBUG_SCREENS.map(screen => screen.key).sort());
        expect(Object.keys(DEBUG_SCREEN_COMPONENTS).sort()).toEqual(menuKeys.sort());
    });

    // If the chip set were a subset, a second rule — "which screen qualifies to become a chip" — would exist all over again.
    it('탭은 모든 화면을 메뉴 순서대로 담는다', () => {
        expect(DEBUG_TABS.map(tab => tab.key)).toEqual(
            DEBUG_MENU_SECTIONS.flatMap(section => section.items.map(item => item.key))
        );
        expect(DEBUG_TABS).toHaveLength(DEBUG_SCREENS.length);
    });

    it('모든 화면에 아이콘이 해석된다', () => {
        DEBUG_SCREENS.forEach(entry => expect(DEBUG_SCREEN_ICONS[entry.icon]).toBeDefined());
    });

    // With labels scattered next to each screen, one panel used to say 'Email Login' and "앱 아이콘" side by side.
    it('모든 화면이 두 언어 모두에 이름을 갖는다', () => {
        Object.values(DEBUG_LOCALE_TABLES).forEach(table => {
            DEBUG_SCREENS.forEach(entry => expect(table.screens[entry.key].title).toBeTruthy());
            expect(Object.keys(table.screens)).toHaveLength(DEBUG_SCREENS.length);
        });
    });

    // The tab strip is narrow — using the full title as-is would let a chip push the strip off screen.
    it('모든 화면이 두 언어 모두에 짧은 라벨을 갖는다', () => {
        Object.values(DEBUG_LOCALE_TABLES).forEach(table => {
            DEBUG_TABS.forEach(tab => expect(table.screens[tab.key].short).toBeTruthy());
        });
    });
});
