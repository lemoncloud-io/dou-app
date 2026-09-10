import { debugOverlayActions, getDebugOverlayState } from './overlayStore';

describe('debugOverlayStore — 오버레이 내비 상태머신', () => {
    beforeEach(() => {
        // close() resets to the initial state, so it doubles as the test reset.
        debugOverlayActions.close();
    });

    it('초기 상태는 닫힘·독 크기·홈이다', () => {
        expect(getDebugOverlayState()).toEqual({ isOpen: false, size: 'dock', screen: null });
    });

    it('open()은 기본 독 크기로 연다', () => {
        debugOverlayActions.open();
        expect(getDebugOverlayState()).toEqual({ isOpen: true, size: 'dock', screen: null });
    });

    it('open("full")은 전체 크기로 바로 연다', () => {
        debugOverlayActions.open('full');
        expect(getDebugOverlayState().size).toBe('full');
    });

    // 크기는 크기만 바꾼다 — 스크린 선택이 크기 때문에 뒤집히지 않는다.
    it('selectScreen은 현재 크기를 유지한 채 스크린만 연다', () => {
        debugOverlayActions.open();
        debugOverlayActions.selectScreen('LogBuffer');
        expect(getDebugOverlayState()).toEqual({ isOpen: true, size: 'dock', screen: 'LogBuffer' });

        debugOverlayActions.expand();
        debugOverlayActions.selectScreen('DBBrowser');
        expect(getDebugOverlayState()).toEqual({ isOpen: true, size: 'full', screen: 'DBBrowser' });
    });

    // 독 폭에서 읽을 수 없는 화면만 매니페스트가 크기를 강제한다.
    it('매니페스트가 크기를 정한 스크린은 그 크기로 열린다', () => {
        debugOverlayActions.open();
        debugOverlayActions.selectScreen('CacheTest');
        expect(getDebugOverlayState()).toEqual({ isOpen: true, size: 'full', screen: 'CacheTest' });
    });

    it('닫힌 상태에서 스크린을 고르면 그대로 열린다', () => {
        debugOverlayActions.selectScreen('Push');
        expect(getDebugOverlayState()).toEqual({ isOpen: true, size: 'dock', screen: 'Push' });
    });

    it('크기 전환은 선택된 스크린을 유지한다', () => {
        debugOverlayActions.selectScreen('LogBuffer');
        debugOverlayActions.expand();
        expect(getDebugOverlayState()).toEqual({ isOpen: true, size: 'full', screen: 'LogBuffer' });

        debugOverlayActions.minimize();
        expect(getDebugOverlayState()).toEqual({ isOpen: true, size: 'dock', screen: 'LogBuffer' });
    });

    it('스크린에서 goBack하면 홈 메뉴로 돌아간다', () => {
        debugOverlayActions.selectScreen('Push');
        debugOverlayActions.goBack();
        expect(getDebugOverlayState()).toEqual({ isOpen: true, size: 'dock', screen: null });
    });

    it('홈에서 goBack하면 오버레이가 닫힌다 (모바일과 동일한 백 동작)', () => {
        debugOverlayActions.open('full');
        debugOverlayActions.goBack();
        expect(getDebugOverlayState().isOpen).toBe(false);
    });

    it('close는 내비 상태를 초기화해 다음 open이 홈에서 시작된다', () => {
        debugOverlayActions.selectScreen('DBBrowser');
        debugOverlayActions.close();
        debugOverlayActions.open('full');
        expect(getDebugOverlayState().screen).toBeNull();
    });
});
