import { debugOverlayActions, getDebugOverlayState } from './overlayStore';

describe('debugOverlayStore — 오버레이 내비 상태머신', () => {
    beforeEach(() => {
        // close() resets to the initial state, so it doubles as the test reset.
        debugOverlayActions.close();
    });

    it('초기 상태는 닫힘·미니 모드·홈이다', () => {
        expect(getDebugOverlayState()).toEqual({ isOpen: false, mode: 'mini', screen: null });
    });

    it('open()은 기본 미니 모드로 연다', () => {
        debugOverlayActions.open();
        expect(getDebugOverlayState()).toEqual({ isOpen: true, mode: 'mini', screen: null });
    });

    it('open("expanded")은 확장 모드로 바로 연다', () => {
        debugOverlayActions.open('expanded');
        expect(getDebugOverlayState().mode).toBe('expanded');
    });

    it('selectScreen은 확장 모드로 전환하며 스크린을 연다', () => {
        debugOverlayActions.open();
        debugOverlayActions.selectScreen('LogBuffer');
        expect(getDebugOverlayState()).toEqual({ isOpen: true, mode: 'expanded', screen: 'LogBuffer' });
    });

    it('minimize는 선택된 스크린을 유지한 채 미니 모드로 내린다', () => {
        debugOverlayActions.selectScreen('LogBuffer');
        debugOverlayActions.minimize();
        expect(getDebugOverlayState()).toEqual({ isOpen: true, mode: 'mini', screen: 'LogBuffer' });

        // Re-expanding returns to where the user was.
        debugOverlayActions.expand();
        expect(getDebugOverlayState().screen).toBe('LogBuffer');
    });

    it('float은 선택된 스크린을 띄운 채 플로팅으로 전환한다', () => {
        debugOverlayActions.selectScreen('DBBrowser');
        debugOverlayActions.float();
        expect(getDebugOverlayState()).toEqual({ isOpen: true, mode: 'float', screen: 'DBBrowser' });

        // 다시 확장하면 같은 스크린으로 돌아온다.
        debugOverlayActions.expand();
        expect(getDebugOverlayState()).toEqual({ isOpen: true, mode: 'expanded', screen: 'DBBrowser' });
    });

    // 스크린이 없으면 띄울 게 없으므로 빈 프레임 대신 관찰 패널로 떨어진다.
    it('스크린이 없을 때 float은 미니 모드로 떨어진다', () => {
        debugOverlayActions.open('expanded');
        debugOverlayActions.float();
        expect(getDebugOverlayState()).toEqual({ isOpen: true, mode: 'mini', screen: null });
    });

    it('스크린에서 goBack하면 홈 메뉴로 돌아간다', () => {
        debugOverlayActions.selectScreen('Push');
        debugOverlayActions.goBack();
        expect(getDebugOverlayState()).toEqual({ isOpen: true, mode: 'expanded', screen: null });
    });

    it('홈에서 goBack하면 오버레이가 닫힌다 (모바일과 동일한 백 동작)', () => {
        debugOverlayActions.open('expanded');
        debugOverlayActions.goBack();
        expect(getDebugOverlayState().isOpen).toBe(false);
    });

    it('close는 내비 상태를 초기화해 다음 open이 홈에서 시작된다', () => {
        debugOverlayActions.selectScreen('DBBrowser');
        debugOverlayActions.close();
        debugOverlayActions.open('expanded');
        expect(getDebugOverlayState().screen).toBeNull();
    });
});
