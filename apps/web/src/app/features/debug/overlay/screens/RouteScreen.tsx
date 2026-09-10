import { useEffect, useState } from 'react';

import { Row } from '../../components/Row';
import { Section } from '../../components/Section';
import { getRouteTrail } from '../../../../utils/routeTrail';
import { routeStackTracker, type RouteStackSnapshot } from '../../../../utils/routeStack';

/**
 * Navigation inspector: the history stack and the visited trail side by side.
 *
 * The two answer different questions and routinely disagree — `/a → /b → back → /c` leaves a trail
 * of `a, b, c` and a stack of `a, c`. Showing them together is the point: a back button that
 * misbehaves is a stack problem, while "how did the user reach this screen" is a trail question.
 *
 * Reads module stores rather than `useLocation`, because the overlay mounts OUTSIDE the Router
 * (see DebugOverlayHost) and has no router context to hook into.
 */
export const RouteScreen = () => {
    const [stack, setStack] = useState<RouteStackSnapshot>(() => routeStackTracker.getSnapshot());
    const [trail, setTrail] = useState<string[]>(() => getRouteTrail());
    const [historyLength, setHistoryLength] = useState(() => window.history.length);

    // Polled, like the Perf screen: the stores are plain module state with no subscription, and the
    // panel is only open while someone is watching it.
    useEffect(() => {
        const poll = () => {
            setStack(routeStackTracker.getSnapshot());
            setTrail(getRouteTrail());
            setHistoryLength(window.history.length);
        };
        poll();
        const id = setInterval(poll, 1000);
        return () => clearInterval(id);
    }, []);

    const depth = stack.entries.length;
    const { currentIndex } = stack;
    const forwardCount = currentIndex === null ? 0 : Math.max(0, depth - currentIndex - 1);

    return (
        <div className="space-y-3 p-4">
            <Section title="요약">
                <Row label="깊이" value={depth ? `${depth}칸` : null} />
                <Row label="현재 위치" value={currentIndex === null ? null : `#${currentIndex}`} />
                <Row label="뒤로 갈 수 있음" value={currentIndex !== null && currentIndex > 0 ? '예' : '아니오'} />
                <Row label="앞으로 남은 항목" value={`${forwardCount}칸`} />
                {/*
                 * `window.history.length` counts entries from before the app was opened (a reused
                 * webview, or a tab that visited other sites first), so it is NOT the app's depth.
                 * useBackHandler still gates the native back button on `history.length > 1`, which
                 * is why the two are shown together — a gap here is that bug, visible.
                 */}
                <Row label="history.length" value={String(historyLength)} />
                {historyLength !== depth && depth > 0 && (
                    <Row
                        label="불일치"
                        value={`앱 스택 ${depth}칸 ≠ history.length ${historyLength} — 앱 진입 전 항목이 섞여 있습니다`}
                    />
                )}
            </Section>

            <Section title="스택 (뒤 → 앞)">
                {!stack.isIndexed && (
                    <Row label="경고" value="라우터를 우회한 history 조작이 있었습니다. 스택을 신뢰할 수 없습니다." />
                )}
                {depth === 0 && <p className="text-xs text-muted-foreground">아직 기록된 전환이 없습니다</p>}
                {stack.entries.map(entry => (
                    <Row
                        key={entry.index}
                        label={`#${entry.index}${entry.isCurrent ? ' ← 현재' : ''}`}
                        value={entry.pathname ?? '(알 수 없음 — 리로드 이전)'}
                    />
                ))}
            </Section>

            <Section title="Trail (방문 순서)">
                {trail.length === 0 && <p className="text-xs text-muted-foreground">아직 방문 기록이 없습니다</p>}
                {trail.map((pathname, order) => (
                    <Row
                        key={`${order}-${pathname}`}
                        label={order === trail.length - 1 ? '현재' : `${order + 1}`}
                        value={pathname}
                    />
                ))}
            </Section>
        </div>
    );
};
