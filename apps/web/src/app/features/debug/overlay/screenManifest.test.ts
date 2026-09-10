import { DEBUG_DOCK_TABS, DEBUG_MENU_SECTIONS, DEBUG_SCREENS } from './screenManifest';
import { DEBUG_LOCALE_TABLES } from '../i18n';
import { DEBUG_SCREEN_ICONS } from './screenIcons';
import { DEBUG_SCREEN_COMPONENTS } from './screenRegistry';

describe('screenManifest — 화면 카탈로그 단일화', () => {
    it('키가 유일하다', () => {
        const keys = DEBUG_SCREENS.map(screen => screen.key);
        expect(new Set(keys).size).toBe(keys.length);
    });

    // 카탈로그가 하나라는 것의 실질: 메뉴에 없는 화면도, 레지스트리에 없는 메뉴 항목도 생길 수 없다.
    it('메뉴는 모든 화면을 한 번씩만 담고, 레지스트리와 짝이 맞는다', () => {
        const menuKeys = DEBUG_MENU_SECTIONS.flatMap(section => section.items.map(item => item.key));
        expect(menuKeys.sort()).toEqual(DEBUG_SCREENS.map(screen => screen.key).sort());
        expect(Object.keys(DEBUG_SCREEN_COMPONENTS).sort()).toEqual(menuKeys.sort());
    });

    it('독 탭은 pinned 화면만, 매니페스트 순서대로 담는다', () => {
        expect(DEBUG_DOCK_TABS.map(tab => tab.key)).toEqual(
            DEBUG_SCREENS.filter(screen => 'pinned' in screen).map(screen => screen.key)
        );
    });

    it('모든 화면에 아이콘이 해석된다', () => {
        DEBUG_SCREENS.forEach(entry => expect(DEBUG_SCREEN_ICONS[entry.icon]).toBeDefined());
    });

    // 라벨이 화면 옆에 흩어져 있던 탓에 한 패널이 'Email Login'과 '앱 아이콘'을 같이 말했다.
    it('모든 화면이 두 언어 모두에 이름을 갖는다', () => {
        Object.values(DEBUG_LOCALE_TABLES).forEach(table => {
            DEBUG_SCREENS.forEach(entry => expect(table.screens[entry.key].title).toBeTruthy());
            expect(Object.keys(table.screens)).toHaveLength(DEBUG_SCREENS.length);
        });
    });

    // 탭 스트립은 좁다 — 고정 화면은 짧은 라벨을 따로 갖는다.
    it('고정 탭은 두 언어 모두에 짧은 라벨을 갖는다', () => {
        Object.values(DEBUG_LOCALE_TABLES).forEach(table => {
            DEBUG_DOCK_TABS.forEach(tab => expect(table.screens[tab.key].short).toBeTruthy());
        });
    });
});
