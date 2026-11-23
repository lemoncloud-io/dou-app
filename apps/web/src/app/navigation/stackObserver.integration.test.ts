import { createBrowserRouter } from 'react-router-dom';

import { observeRouterRoutes, onTransientUiTransition, resetTransientUiListeners } from './stackObserver';
import { getRouteTrail, resetRouteTrail } from '../utils/routeTrail';
import { routeStackTracker } from './stackTracker';

const paths = () => routeStackTracker.getSnapshot().entries.map(entry => entry.pathname);

const routes = [
    { path: '/', element: null },
    { path: '/a', element: null },
    { path: '/b', element: null },
    { path: '/c', element: null },
];

const goBack = async (router: ReturnType<typeof createBrowserRouter>): Promise<void> => {
    const from = router.state.location.pathname;
    await router.navigate(-1);

    for (let attempt = 0; attempt < 50 && router.state.location.pathname === from; attempt += 1) {
        await new Promise(resolve => setTimeout(resolve, 1));
    }

    if (router.state.location.pathname === from) throw new Error(`back navigation never landed from ${from}`);
};

const installRequestStub = (): (() => void) => {
    const globalRef = globalThis as { Request?: unknown };
    if (globalRef.Request) return () => undefined;

    globalRef.Request = class {
        constructor(
            readonly url: string,
            readonly init?: { signal?: AbortSignal }
        ) {}
    };
    return () => delete globalRef.Request;
};

describe('observeRouterRoutes — 실제 라우터 연동', () => {
    let unsubscribe: (() => void) | undefined;
    let removeRequestStub: () => void;

    beforeAll(() => {
        removeRequestStub = installRequestStub();
    });

    afterAll(() => {
        removeRequestStub();
    });

    beforeEach(() => {
        window.history.pushState(null, '', '/');
        routeStackTracker.reset();
        resetRouteTrail();
        resetTransientUiListeners();
    });

    afterEach(() => {
        unsubscribe?.();
        unsubscribe = undefined;
    });

    it('push 두 번이면 스택이 3칸이고 커서가 맨 위에 있다', async () => {
        const router = createBrowserRouter(routes);
        unsubscribe = observeRouterRoutes(router);

        await router.navigate('/a');
        await router.navigate('/b');

        expect(paths()).toEqual(['/', '/a', '/b']);
        expect(routeStackTracker.getSnapshot().currentIndex).toBe(2);
        expect(routeStackTracker.getSnapshot().isIndexed).toBe(true);
    });

    it('뒤로 간 뒤 push하면 앞쪽 가지를 버린다 — trail은 버리지 않는다', async () => {
        const router = createBrowserRouter(routes);
        unsubscribe = observeRouterRoutes(router);

        await router.navigate('/a');
        await router.navigate('/b');
        await goBack(router);
        await router.navigate('/c');

        expect(paths()).toEqual(['/', '/a', '/c']);
        expect(routeStackTracker.getSnapshot().currentIndex).toBe(2);

        expect(getRouteTrail()).toEqual(['/', '/a', '/b', '/a', '/c']);
    });

    it('replace는 제자리를 덮어쓰고 깊이를 늘리지 않는다', async () => {
        const router = createBrowserRouter(routes);
        unsubscribe = observeRouterRoutes(router);

        await router.navigate('/a');
        await router.navigate('/b', { replace: true });

        expect(paths()).toEqual(['/', '/b']);
        expect(routeStackTracker.getSnapshot().currentIndex).toBe(1);
    });

    it('뒤로 가면 앞쪽 항목을 남긴 채 커서만 내려간다', async () => {
        const router = createBrowserRouter(routes);
        unsubscribe = observeRouterRoutes(router);

        await router.navigate('/a');
        await goBack(router);

        expect(paths()).toEqual(['/', '/a']);
        expect(routeStackTracker.getSnapshot().currentIndex).toBe(0);
    });

    it('구독 전 현재 위치도 기록한다', () => {
        const router = createBrowserRouter(routes);
        unsubscribe = observeRouterRoutes(router);

        expect(paths()).toEqual(['/']);
        expect(getRouteTrail()).toEqual(['/']);
    });

    it('전이 때 transient UI 리스너를 부르고, 첫 기록에서는 부르지 않는다', async () => {
        const dismissed = jest.fn();
        onTransientUiTransition(dismissed);

        const router = createBrowserRouter(routes);
        unsubscribe = observeRouterRoutes(router);

        expect(dismissed).not.toHaveBeenCalled();

        await router.navigate('/a');
        expect(dismissed).toHaveBeenCalledTimes(1);

        await goBack(router);
        expect(dismissed).toHaveBeenCalledTimes(2);
    });

    it('같은 경로로의 replace는 리스너를 부르지 않는다', async () => {
        const router = createBrowserRouter(routes);
        unsubscribe = observeRouterRoutes(router);
        await router.navigate('/a');

        const dismissed = jest.fn();
        onTransientUiTransition(dismissed);
        await router.navigate('/a', { replace: true });

        expect(dismissed).not.toHaveBeenCalled();
    });

    it('구독을 해지하면 더 이상 부르지 않는다', async () => {
        const dismissed = jest.fn();
        const stop = onTransientUiTransition(dismissed);

        const router = createBrowserRouter(routes);
        unsubscribe = observeRouterRoutes(router);
        stop();
        await router.navigate('/a');

        expect(dismissed).not.toHaveBeenCalled();
    });
});
