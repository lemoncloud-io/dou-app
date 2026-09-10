import '@testing-library/jest-dom';

import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { RouteScreen } from './RouteScreen';
import { recordRoute, resetRouteTrail } from '../../../../utils/routeTrail';
import { routeStackTracker } from '../../../../utils/routeStack';

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
        expect(screen.getAllByText('/channels/abc')).toHaveLength(2); // 스택 + trail
    });

    // 스택과 trail이 갈라지는 바로 그 경우. 두 목록이 다른 답을 보여야 한다.
    it('뒤로 간 뒤 push하면 스택은 버린 항목을 감추고 trail은 남긴다', () => {
        (['/a', '/b'] as const).forEach((pathname, index) =>
            routeStackTracker.record({ pathname, action: 'PUSH', index })
        );
        routeStackTracker.record({ pathname: '/a', action: 'POP', index: 0 });
        routeStackTracker.record({ pathname: '/c', action: 'PUSH', index: 1 });
        ['/a', '/b', '/a', '/c'].forEach(recordRoute);

        render(<RouteScreen />);

        // 스택에는 /b가 없다.
        const stackSection = screen.getByText('스택 (뒤 → 앞)').parentElement as HTMLElement;
        expect(stackSection.textContent).not.toContain('/b');
        expect(stackSection.textContent).toContain('/c');

        // trail에는 남아 있다.
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

    // useBackHandler가 history.length로 뒤로가기를 판정한다. 그 값이 앱 깊이와 다르다는 것을
    // 화면이 말해줘야 그 버그를 쫓을 수 있다.
    it('history.length와 앱 스택 깊이가 다르면 불일치를 알린다', () => {
        routeStackTracker.record({ pathname: '/', action: 'PUSH', index: 0 });
        window.history.pushState({ idx: 0 }, '');

        render(<RouteScreen />);

        expect(
            screen.getByText(new RegExp(`앱 스택 1칸 ≠ history.length ${window.history.length}`))
        ).toBeInTheDocument();
    });

    // 숫자만 있으면 어느 쪽이 앱 깊이고 어느 쪽이 브라우저 값인지 알 수 없다.
    it('모든 지표에 설명이 붙어 있고, 호버로 읽을 수 있다', () => {
        routeStackTracker.record({ pathname: '/', action: 'PUSH', index: 0 });

        render(<RouteScreen />);

        // 호버 경로: 네이티브 title 속성.
        expect(screen.getByRole('button', { name: '깊이' }).getAttribute('title')).toContain(
            '앱에 들어오기 전 항목은 세지 않습니다'
        );
        // history.length가 앱 깊이가 아니라는 것이 이 화면의 핵심 정보다.
        expect(screen.getByRole('button', { name: 'history.length' }).getAttribute('title')).toContain(
            '앱 깊이가 아닙니다'
        );
    });

    // 실기기에는 호버가 없다. 탭으로 같은 설명에 닿아야 한다.
    it('터치에서는 라벨을 눌러 설명을 펼친다', async () => {
        routeStackTracker.record({ pathname: '/', action: 'PUSH', index: 0 });

        render(<RouteScreen />);
        const label = screen.getByRole('button', { name: '현재 위치' });
        expect(label).toHaveAttribute('aria-expanded', 'false');

        await userEvent.click(label);

        expect(label).toHaveAttribute('aria-expanded', 'true');
        expect(screen.getByText(/#0이 앱의 첫 화면입니다/)).toBeInTheDocument();
    });

    // 스택과 trail의 구분은 이 화면을 읽기 전에 알아야 한다 — 펼쳐야 보이면 늦다.
    it('두 목록의 뜻은 접지 않고 항상 보여준다', () => {
        render(<RouteScreen />);

        expect(screen.getByText(/지금 내 뒤에 쌓여 있는 것/)).toBeInTheDocument();
        expect(screen.getByText(/거쳐온 화면을 시간순으로/)).toBeInTheDocument();
    });
});
