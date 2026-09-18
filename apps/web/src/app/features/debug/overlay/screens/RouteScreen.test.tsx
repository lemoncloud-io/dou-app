import '@testing-library/jest-dom';

import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { RouteScreen } from './RouteScreen';
import { recordRoute, resetRouteTrail } from '../../../../utils/routeTrail';
import { routeStackTracker } from '../../../../utils/routeStack';

const copyTextWithResult = jest.fn().mockResolvedValue(true);
jest.mock('../../lib/copyText', () => ({
    copyTextWithResult: (value: string) => copyTextWithResult(value),
    copyText: () => undefined,
}));

/**
 * The screen reads module stores, not router context: the overlay mounts OUTSIDE the Router (see
 * DebugOverlayHost), so a screen that reached for `useLocation` would throw and take the overlay
 * down. Rendering it with no providers at all is the contract being pinned.
 */
describe('RouteScreen — 라우트 스택 인스펙터', () => {
    beforeEach(() => {
        routeStackTracker.reset();
        resetRouteTrail();
    });

    it('프로바이더 없이 렌더되고, 기록이 없으면 없다고 말한다', () => {
        expect(() => render(<RouteScreen />)).not.toThrow();

        expect(screen.getByText('아직 기록된 전환이 없습니다')).toBeInTheDocument();
        expect(screen.getByText('아직 방문 기록이 없습니다')).toBeInTheDocument();
    });

    it('스택과 trail을 함께 보여주고 현재 위치를 표시한다', () => {
        routeStackTracker.record({ pathname: '/', action: 'PUSH', index: 0 });
        routeStackTracker.record({ pathname: '/channels/abc', action: 'PUSH', index: 1 });
        recordRoute('/');
        recordRoute('/channels/abc');

        render(<RouteScreen />);

        expect(screen.getByText('#1 ← 현재')).toBeInTheDocument();
        expect(screen.getByText('2칸')).toBeInTheDocument();
        expect(screen.getAllByText('/channels/abc')).toHaveLength(2); // stack + trail
    });

    // Exactly the case where the stack and the trail diverge. The two lists must show different answers.
    it('뒤로 간 뒤 push하면 스택은 버린 항목을 감추고 trail은 남긴다', () => {
        (['/a', '/b'] as const).forEach((pathname, index) =>
            routeStackTracker.record({ pathname, action: 'PUSH', index })
        );
        routeStackTracker.record({ pathname: '/a', action: 'POP', index: 0 });
        routeStackTracker.record({ pathname: '/c', action: 'PUSH', index: 1 });
        ['/a', '/b', '/a', '/c'].forEach(recordRoute);

        render(<RouteScreen />);

        // /b is not in the stack.
        const stackSection = screen.getByText('스택 (뒤 → 앞)').parentElement as HTMLElement;
        expect(stackSection.textContent).not.toContain('/b');
        expect(stackSection.textContent).toContain('/c');

        // It remains in the trail.
        const trailSection = screen.getByText('Trail (방문 순서)').parentElement as HTMLElement;
        expect(trailSection.textContent).toContain('/b');
    });

    it('리로드로 아래를 모르면 알 수 없음으로 보여준다', () => {
        routeStackTracker.record({ pathname: '/channels/abc', action: 'PUSH', index: 2 });

        render(<RouteScreen />);

        expect(screen.getAllByText('(알 수 없음 — 리로드 이전)')).toHaveLength(2);
    });

    it('라우터를 우회한 history 조작이 있었으면 경고한다', () => {
        routeStackTracker.record({ pathname: '/a', action: 'PUSH', index: null });

        render(<RouteScreen />);

        expect(screen.getByText(/스택을 신뢰할 수 없습니다/)).toBeInTheDocument();
    });

    // useBackHandler decides whether to go back based on history.length. The screen has to say
    // when that value differs from the app's own depth, or that bug can't be tracked down.
    it('history.length와 앱 스택 깊이가 다르면 불일치를 알린다', () => {
        routeStackTracker.record({ pathname: '/', action: 'PUSH', index: 0 });
        window.history.pushState({ idx: 0 }, '');

        render(<RouteScreen />);

        expect(
            screen.getByText(new RegExp(`앱 스택 1칸 ≠ history.length ${window.history.length}`))
        ).toBeInTheDocument();
    });

    // With only the numbers, there's no way to tell which is the app's depth and which is the browser's value.
    it('모든 지표에 설명이 붙어 있고, 호버로 읽을 수 있다', () => {
        routeStackTracker.record({ pathname: '/', action: 'PUSH', index: 0 });

        render(<RouteScreen />);

        // Hover path: the native title attribute.
        expect(screen.getByRole('button', { name: '깊이' }).getAttribute('title')).toContain(
            '앱에 들어오기 전 항목은 세지 않습니다'
        );
        // That history.length is not the app's depth is this screen's key piece of information.
        expect(screen.getByRole('button', { name: 'history.length' }).getAttribute('title')).toContain(
            '앱 깊이가 아닙니다'
        );
    });

    // A real device has no hover. Tapping must reach the same explanation.
    it('터치에서는 라벨을 눌러 설명을 펼친다', async () => {
        routeStackTracker.record({ pathname: '/', action: 'PUSH', index: 0 });

        render(<RouteScreen />);
        const label = screen.getByRole('button', { name: '현재 위치' });
        expect(label).toHaveAttribute('aria-expanded', 'false');

        await userEvent.click(label);

        expect(label).toHaveAttribute('aria-expanded', 'true');
        expect(screen.getByText(/#0이 앱의 첫 화면입니다/)).toBeInTheDocument();
    });

    // If what's on screen disagrees with what's copied to the clipboard, the pasted report becomes a lie.
    it('복사하면 화면에 보이는 스택과 trail이 그대로 담긴다', async () => {
        routeStackTracker.record({ pathname: '/a', action: 'PUSH', index: 0 });
        routeStackTracker.record({ pathname: '/b', action: 'PUSH', index: 1 });
        recordRoute('/a');
        recordRoute('/b');

        render(<RouteScreen />);
        await userEvent.click(screen.getByRole('button', { name: /라우트 복사/ }));

        const copied = JSON.parse(copyTextWithResult.mock.calls[0][0] as string);
        expect(copied.depth).toBe(2);
        expect(copied.currentIndex).toBe(1);
        expect(copied.stack.entries.map((e: { pathname: string }) => e.pathname)).toEqual(['/a', '/b']);
        expect(copied.trail).toEqual(['/a', '/b']);
    });

    // The distinction between stack and trail has to be known before reading this screen — if it only shows when expanded, that's too late.
    it('두 목록의 뜻은 접지 않고 항상 보여준다', () => {
        render(<RouteScreen />);

        expect(screen.getByText(/지금 내 뒤에 쌓여 있는 것/)).toBeInTheDocument();
        expect(screen.getByText(/거쳐온 화면을 시간순으로/)).toBeInTheDocument();
    });
});
