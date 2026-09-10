import '@testing-library/jest-dom';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { DebugPanel } from './DebugPanel';
import { debugOverlayActions, getDebugOverlayState } from './overlayStore';

// The panel is the only shell now, so these assertions stand in for what MiniPanel / FloatingScreen /
// ExpandedSheet used to cover separately: one navigation, one catalog, size as its own axis.
type ShellWindow = { ReactNativeWebView?: { postMessage: () => void } };

const attachShell = () => {
    (window as unknown as ShellWindow).ReactNativeWebView = { postMessage: () => undefined };
};

describe('DebugPanel — 하나의 패널', () => {
    beforeEach(() => {
        delete (window as unknown as ShellWindow).ReactNativeWebView;
        debugOverlayActions.close();
        debugOverlayActions.open();
    });

    it('홈에서 모든 화면을 칩으로도, 메뉴로도 보여준다', () => {
        render(<DebugPanel />);

        expect(screen.getByRole('tab', { name: '상태' })).toBeInTheDocument();
        expect(screen.getByRole('tab', { name: 'DB 브라우저' })).toBeInTheDocument();
        // 예전에는 메뉴에만 있던 화면 — 이제 칩에도 있다.
        expect(screen.getByRole('tab', { name: '분할 업로드 테스트' })).toBeInTheDocument();
        expect(screen.getByRole('button', { name: '분할 업로드 테스트' })).toBeInTheDocument();
    });

    // 브라우저에서 열면 눌러도 실패하는 버튼만 보이던 화면들이다.
    it('셸이 없으면 앱 전용 화면에 배지를 단다', () => {
        render(<DebugPanel />);

        const row = screen.getByRole('button', { name: /푸시 \(토큰·수신\)/ });
        expect(row).toHaveTextContent('앱 전용');
        // 셸이 필요 없는 화면은 그대로다.
        expect(screen.getByRole('button', { name: '브릿지' })).not.toHaveTextContent('앱 전용');
    });

    it('셸이 붙어 있으면 배지가 없다', () => {
        attachShell();
        render(<DebugPanel />);

        expect(screen.getByRole('button', { name: /푸시 \(토큰·수신\)/ })).not.toHaveTextContent('앱 전용');
    });

    // 화면을 렌더하고 실패하게 두는 대신, 셸이 없다는 사실을 셸(패널)이 한 곳에서 말한다.
    it('셸이 없으면 앱 전용 화면 대신 이유를 보여준다', () => {
        debugOverlayActions.selectScreen('Sms');
        render(<DebugPanel />);

        expect(screen.getByText(/앱 안에서만 동작합니다/)).toBeInTheDocument();
        expect(screen.queryByText(/작성 창 열기/)).not.toBeInTheDocument();
    });

    // 앱 아이콘은 마이페이지에 제품 UI가 있고, 프로필 편집은 쓰이지 않았다.
    it('메뉴에서 뺀 화면은 어디에도 없다', () => {
        render(<DebugPanel />);

        expect(screen.queryByText('앱 아이콘')).not.toBeInTheDocument();
        expect(screen.queryByText('내 프로필 편집')).not.toBeInTheDocument();
    });

    it('탭을 누르면 같은 패널 안에서 그 화면으로 간다', async () => {
        render(<DebugPanel />);

        await userEvent.click(screen.getByRole('tab', { name: '안읽음' }));

        expect(getDebugOverlayState()).toEqual({ isOpen: true, size: 'dock', screen: 'Unread' });
        // Size did not change: switching screens never resizes under the user.
        expect(screen.getByRole('button', { name: 'expand' })).toBeInTheDocument();
        expect(screen.getByRole('tab', { name: '안읽음' })).toHaveAttribute('aria-selected', 'true');
    });

    it('스크린에서 back을 누르면 홈 메뉴로 돌아온다', async () => {
        debugOverlayActions.selectScreen('Unread');
        render(<DebugPanel />);

        await userEvent.click(screen.getByRole('button', { name: 'back' }));

        expect(getDebugOverlayState().screen).toBeNull();
        expect(screen.getByRole('button', { name: '분할 업로드 테스트' })).toBeInTheDocument();
    });

    it('크기를 바꿔도 같은 카탈로그가 그대로 있다', async () => {
        render(<DebugPanel />);

        await userEvent.click(screen.getByRole('button', { name: 'expand' }));

        expect(getDebugOverlayState().size).toBe('full');
        expect(screen.getByRole('tab', { name: '상태' })).toBeInTheDocument();
        expect(screen.getByRole('button', { name: '분할 업로드 테스트' })).toBeInTheDocument();
    });

    // mini · dock · full 세 단계를 한 축으로 오르내린다.
    it('축소·확대는 세 크기를 한 단계씩 오간다', async () => {
        render(<DebugPanel />);

        await userEvent.click(screen.getByRole('button', { name: 'minimize' }));
        expect(getDebugOverlayState().size).toBe('mini');
        // 제일 작은 단계에서는 더 줄일 수 없으므로 축소 버튼이 없다.
        expect(screen.queryByRole('button', { name: 'minimize' })).not.toBeInTheDocument();
        // 라벨은 접히지만 탭 자체는 남는다 — 접근 이름은 화면 제목으로 유지한다.
        expect(screen.getByRole('tab', { name: '상태' })).toBeInTheDocument();

        await userEvent.click(screen.getByRole('button', { name: 'expand' }));
        expect(getDebugOverlayState().size).toBe('dock');

        await userEvent.click(screen.getByRole('button', { name: 'expand' }));
        expect(getDebugOverlayState().size).toBe('full');
        expect(screen.queryByRole('button', { name: 'expand' })).not.toBeInTheDocument();
    });

    // The gap that started this: every native screen exercises one command, none of them said
    // whether the channel underneath exists.
    it('브릿지 화면이 메뉴에 있다', () => {
        render(<DebugPanel />);
        expect(screen.getByRole('button', { name: '브릿지' })).toBeInTheDocument();
    });
});
