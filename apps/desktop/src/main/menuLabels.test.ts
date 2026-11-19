import { menuLabels } from './menuLabels';

describe('menuLabels', () => {
    it('follows a Korean OS locale', () => {
        expect(menuLabels('ko-KR').settings).toBe('설정');
        expect(menuLabels('ko').go).toBe('이동');
        expect(menuLabels('ko').back).toBe('뒤로');
        expect(menuLabels('ko').forward).toBe('앞으로');
        expect(menuLabels('ko').resetZoom).toBe('실제 크기');
    });

    it('falls back to English for every other locale, including an unset one', () => {
        expect(menuLabels('en-US').settings).toBe('Settings');
        expect(menuLabels('ja-JP').settings).toBe('Settings');
        expect(menuLabels('').settings).toBe('Settings');
        expect(menuLabels('en-US').resetZoom).toBe('Reset Zoom');
        expect(menuLabels('en-US').back).toBe('Back');
        expect(menuLabels('en-US').forward).toBe('Forward');
    });
});
