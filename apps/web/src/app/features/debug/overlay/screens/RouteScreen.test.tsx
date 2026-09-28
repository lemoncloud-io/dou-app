import '@testing-library/jest-dom';

import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { RouteScreen } from './RouteScreen';
import { setDebugLanguageForTests } from '../../i18n';
import { recordRoute, resetRouteTrail } from '../../../../utils/routeTrail';
import { routeStackTracker } from '../../../../navigation';

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
    let restoreLanguage: () => void;

    beforeEach(() => {
        restoreLanguage = setDebugLanguageForTests('en');
        routeStackTracker.reset();
        resetRouteTrail();
        // jsdom keeps history state across cases in a file. The screen reads the LIVE router index
        // now, not just the tracker snapshot, so without this a leftover entry decides a later case.
        window.history.pushState({ idx: 0 }, '');
    });

    afterEach(() => restoreLanguage());

    it('프로바이더 없이 렌더되고, 기록이 없으면 없다고 말한다', () => {
        expect(() => render(<RouteScreen />)).not.toThrow();

        expect(screen.getByText('No transitions recorded yet')).toBeInTheDocument();
        expect(screen.getByText('No visits recorded yet')).toBeInTheDocument();
    });

    it('스택과 trail을 함께 보여주고 현재 위치를 표시한다', () => {
        routeStackTracker.record({ pathname: '/', action: 'PUSH', index: 0 });
        routeStackTracker.record({ pathname: '/channels/abc', action: 'PUSH', index: 1 });
        recordRoute('/');
        recordRoute('/channels/abc');

        render(<RouteScreen />);

        expect(screen.getByText('#1 ← current')).toBeInTheDocument();
        expect(screen.getByText('2 entries')).toBeInTheDocument();
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
        const stackSection = screen.getByText('Stack (back → forward)').parentElement as HTMLElement;
        expect(stackSection.textContent).not.toContain('/b');
        expect(stackSection.textContent).toContain('/c');

        // It remains in the trail.
        const trailSection = screen.getByText('Trail (visit order)').parentElement as HTMLElement;
        expect(trailSection.textContent).toContain('/b');
    });

    it('리로드로 아래를 모르면 알 수 없음으로 보여준다', () => {
        routeStackTracker.record({ pathname: '/channels/abc', action: 'PUSH', index: 2 });

        render(<RouteScreen />);

        expect(screen.getAllByText('(unknown — before reload)')).toHaveLength(2);
    });

    it('라우터를 우회한 history 조작이 있었으면 경고한다', () => {
        routeStackTracker.record({ pathname: '/a', action: 'PUSH', index: null });

        render(<RouteScreen />);

        expect(screen.getByText(/Stack cannot be trusted/)).toBeInTheDocument();
    });

    // The row the back button actually consults. It asks `canGoBackInApp()` rather than deriving an
    // answer from the snapshot beside it, because the two can disagree: the tracker holds the last
    // index it OBSERVED, while the judgement reads the live one. A pushState that bypassed the
    // router is exactly that case — and a panel claiming back works while it does nothing is worse
    // than no panel.
    it('뒤로 갈 수 있음은 스냅샷이 아니라 실제 판정을 따른다', () => {
        routeStackTracker.record({ pathname: '/a', action: 'PUSH', index: 0 });
        routeStackTracker.record({ pathname: '/b', action: 'PUSH', index: 1 });
        // The tracker still shows depth 2 at index 1, but the live entry has no router index.
        window.history.pushState({ bypassedTheRouter: true }, '');

        render(<RouteScreen />);

        expect(screen.getByRole('button', { name: 'Can go back' }).parentElement).toHaveTextContent('No');
    });

    it('앱 첫 화면 위에 있으면 뒤로 갈 수 있음이 예다', () => {
        routeStackTracker.record({ pathname: '/a', action: 'PUSH', index: 0 });
        window.history.pushState({ idx: 1 }, '');

        render(<RouteScreen />);

        expect(screen.getByRole('button', { name: 'Can go back' }).parentElement).toHaveTextContent('Yes');
    });

    // The two values routinely disagree, and only this screen says so. Reading history.length as
    // the app's depth is the mistake this row exists to prevent — it is what the back judgement
    // used to be built on.
    it('history.length와 앱 스택 깊이가 다르면 불일치를 알린다', () => {
        routeStackTracker.record({ pathname: '/', action: 'PUSH', index: 0 });
        window.history.pushState({ idx: 0 }, '');

        render(<RouteScreen />);

        expect(
            screen.getByText(new RegExp(`App stack 1 ≠ history.length ${window.history.length}`))
        ).toBeInTheDocument();
    });

    // With only the numbers, there's no way to tell which is the app's depth and which is the browser's value.
    it('모든 지표에 설명이 붙어 있고, 호버로 읽을 수 있다', () => {
        routeStackTracker.record({ pathname: '/', action: 'PUSH', index: 0 });

        render(<RouteScreen />);

        // Hover path: the native title attribute.
        expect(screen.getByRole('button', { name: 'Depth' }).getAttribute('title')).toContain("don't count");
        // That history.length is not the app's depth is this screen's key piece of information.
        expect(screen.getByRole('button', { name: 'history.length' }).getAttribute('title')).toContain(
            "not the app's depth"
        );
    });

    // A real device has no hover. Tapping must reach the same explanation.
    it('터치에서는 라벨을 눌러 설명을 펼친다', async () => {
        routeStackTracker.record({ pathname: '/', action: 'PUSH', index: 0 });

        render(<RouteScreen />);
        const label = screen.getByRole('button', { name: 'Current position' });
        expect(label).toHaveAttribute('aria-expanded', 'false');

        await userEvent.click(label);

        expect(label).toHaveAttribute('aria-expanded', 'true');
        expect(screen.getByText(/#0 is the app's first screen/)).toBeInTheDocument();
    });

    // If what's on screen disagrees with what's copied to the clipboard, the pasted report becomes a lie.
    it('복사하면 화면에 보이는 스택과 trail이 그대로 담긴다', async () => {
        routeStackTracker.record({ pathname: '/a', action: 'PUSH', index: 0 });
        routeStackTracker.record({ pathname: '/b', action: 'PUSH', index: 1 });
        recordRoute('/a');
        recordRoute('/b');
        window.history.pushState({ idx: 1 }, '');

        render(<RouteScreen />);
        await userEvent.click(screen.getByRole('button', { name: /Copy route/ }));

        const copied = JSON.parse(copyTextWithResult.mock.calls[0][0] as string);
        expect(copied.depth).toBe(2);
        expect(copied.currentIndex).toBe(1);
        expect(copied.canGoBack).toBe(true);
        expect(copied.stack.entries.map((e: { pathname: string }) => e.pathname)).toEqual(['/a', '/b']);
        expect(copied.trail).toEqual(['/a', '/b']);
    });

    // The distinction between stack and trail has to be known before reading this screen — if it only shows when expanded, that's too late.
    it('두 목록의 뜻은 접지 않고 항상 보여준다', () => {
        render(<RouteScreen />);

        expect(screen.getByText(/What's stacked behind you right now/)).toBeInTheDocument();
        expect(screen.getByText(/Screens visited, in chronological order/)).toBeInTheDocument();
    });
});
