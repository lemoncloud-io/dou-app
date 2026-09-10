import { createBrowserRouter } from 'react-router-dom';

import { observeRouterRoutes } from './routeObserver';
import { getRouteTrail, resetRouteTrail } from '../utils/routeTrail';
import { routeStackTracker } from '../utils/routeStack';

/**
 * Drives a REAL `createBrowserRouter` in jsdom, because what the stack depends on is a router
 * internal: `completeNavigation` notifies subscribers before it writes the history entry, so a
 * PUSH is seen while `history.state.idx` is still one behind (see `resolveTransitionIndex`).
 *
 * A hand-rolled fake router would happily agree with whatever we assumed. This suite is the thing
 * that fails if a react-router upgrade reorders those two steps — the failure mode it guards
 * against is silent: every displayed depth off by one.
 */
const paths = () => routeStackTracker.getSnapshot().entries.map(entry => entry.pathname);

const routes = [
    { path: '/', element: null },
    { path: '/a', element: null },
    { path: '/b', element: null },
    { path: '/c', element: null },
];

/**
 * Goes back and waits for it to land.
 *
 * `navigate(-1)` delegates to `history.go`, which resolves before jsdom dispatches `popstate` — so
 * awaiting the call is not enough, and a fixed timeout would only be flaky. Poll the router's own
 * location instead.
 */
const goBack = async (router: ReturnType<typeof createBrowserRouter>): Promise<void> => {
    const from = router.state.location.pathname;
    await router.navigate(-1);

    for (let attempt = 0; attempt < 50 && router.state.location.pathname === from; attempt += 1) {
        await new Promise(resolve => setTimeout(resolve, 1));
    }

    if (router.state.location.pathname === from) throw new Error(`back navigation never landed from ${from}`);
};

/**
 * jsdom exposes no `Request`, and the router builds one for every navigation
 * (`createClientSideRequest`). These routes declare no loaders, so the object is created and never
 * read — a carrier is enough. Scoped to this suite rather than `jest.setup.ts`: a global fetch
 * primitive would change what 270 other suites see.
 */
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
        // A fresh entry with no router index, as a cold tab has.
        window.history.pushState(null, '', '/');
        routeStackTracker.reset();
        resetRouteTrail();
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

        // 스택: /b는 사라지고 그 자리에 /c가 온다.
        expect(paths()).toEqual(['/', '/a', '/c']);
        expect(routeStackTracker.getSnapshot().currentIndex).toBe(2);

        // trail: 방문 순서는 그대로 남는다. 두 스토어가 다른 답을 준다는 것이 요점이다.
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
});
