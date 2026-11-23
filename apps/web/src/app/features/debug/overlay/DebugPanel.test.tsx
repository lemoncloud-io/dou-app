import '@testing-library/jest-dom';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { DebugPanel } from './DebugPanel';
import { debugOverlayActions, getDebugOverlayState } from './overlayStore';

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
        expect(screen.getByRole('tab', { name: '업로드 테스트' })).toBeInTheDocument();
        expect(screen.getByRole('button', { name: '업로드 테스트' })).toBeInTheDocument();
    });

    it('셸이 없으면 앱 전용 화면에 배지를 단다', () => {
        render(<DebugPanel />);

        const row = screen.getByRole('button', { name: /푸시 \(토큰·수신\)/ });
        expect(row).toHaveTextContent('앱 전용');
        expect(screen.getByRole('button', { name: '브릿지' })).not.toHaveTextContent('앱 전용');
    });

    it('셸이 붙어 있으면 배지가 없다', () => {
        attachShell();
        render(<DebugPanel />);

        expect(screen.getByRole('button', { name: /푸시 \(토큰·수신\)/ })).not.toHaveTextContent('앱 전용');
    });

    it('셸이 없으면 앱 전용 화면 대신 이유를 보여준다', () => {
        debugOverlayActions.selectScreen('Sms');
        render(<DebugPanel />);

        expect(screen.getByText(/앱 안에서만 동작합니다/)).toBeInTheDocument();
        expect(screen.queryByText(/작성 창 열기/)).not.toBeInTheDocument();
    });

    it('메뉴에서 뺀 화면은 어디에도 없다', () => {
        render(<DebugPanel />);

        expect(screen.queryByText('앱 아이콘')).not.toBeInTheDocument();
        expect(screen.queryByText('내 프로필 편집')).not.toBeInTheDocument();
    });

    it('탭을 누르면 같은 패널 안에서 그 화면으로 간다', async () => {
        render(<DebugPanel />);

        await userEvent.click(screen.getByRole('tab', { name: '안읽음' }));

        expect(getDebugOverlayState()).toEqual({ isOpen: true, size: 'dock', screen: 'Unread' });
        expect(screen.getByRole('button', { name: 'expand' })).toBeInTheDocument();
        expect(screen.getByRole('tab', { name: '안읽음' })).toHaveAttribute('aria-selected', 'true');
    });

    it('스크린에서 back을 누르면 홈 메뉴로 돌아온다', async () => {
        debugOverlayActions.selectScreen('Unread');
        render(<DebugPanel />);

        await userEvent.click(screen.getByRole('button', { name: 'back' }));

        expect(getDebugOverlayState().screen).toBeNull();
        expect(screen.getByRole('button', { name: '업로드 테스트' })).toBeInTheDocument();
    });

    it('크기를 바꿔도 같은 카탈로그가 그대로 있다', async () => {
        render(<DebugPanel />);

        await userEvent.click(screen.getByRole('button', { name: 'expand' }));

        expect(getDebugOverlayState().size).toBe('full');
        expect(screen.getByRole('tab', { name: '상태' })).toBeInTheDocument();
        expect(screen.getByRole('button', { name: '업로드 테스트' })).toBeInTheDocument();
    });

    it('축소·확대는 세 크기를 한 단계씩 오간다', async () => {
        render(<DebugPanel />);

        await userEvent.click(screen.getByRole('button', { name: 'minimize' }));
        expect(getDebugOverlayState().size).toBe('mini');
        expect(screen.queryByRole('button', { name: 'minimize' })).not.toBeInTheDocument();
        expect(screen.getByRole('tab', { name: '상태' })).toBeInTheDocument();

        await userEvent.click(screen.getByRole('button', { name: 'expand' }));
        expect(getDebugOverlayState().size).toBe('dock');

        await userEvent.click(screen.getByRole('button', { name: 'expand' }));
        expect(getDebugOverlayState().size).toBe('full');
        expect(screen.queryByRole('button', { name: 'expand' })).not.toBeInTheDocument();
    });

    it('브릿지 화면이 메뉴에 있다', () => {
        render(<DebugPanel />);
        expect(screen.getByRole('button', { name: '브릿지' })).toBeInTheDocument();
    });
});
