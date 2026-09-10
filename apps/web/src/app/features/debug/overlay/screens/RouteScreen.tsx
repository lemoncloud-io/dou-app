import { useCallback, useEffect, useState } from 'react';

import { CopyButton } from '../../components/CopyButton';
import { HintRow } from '../../components/HintRow';
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
 *
 * Every number carries a hint (see HintRow): the values here are only useful to someone who knows
 * which of them is the app's own depth and which is the browser's, and that distinction is exactly
 * what the numbers do not show on their own.
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

    const snapshot = useCallback(
        () => JSON.stringify({ depth, currentIndex, forwardCount, historyLength, stack, trail }, null, 2),
        [depth, currentIndex, forwardCount, historyLength, stack, trail]
    );

    return (
        <div className="space-y-3 p-4">
            <div className="flex justify-end">
                <CopyButton value={snapshot} label="라우트 복사" />
            </div>

            <Section title="요약">
                <HintRow
                    label="깊이"
                    value={depth ? `${depth}칸` : null}
                    hint="이 앱이 쌓은 히스토리 항목 수입니다. 앱에 들어오기 전 항목은 세지 않습니다."
                />
                <HintRow
                    label="현재 위치"
                    value={currentIndex === null ? null : `#${currentIndex}`}
                    hint="라우터가 히스토리 항목마다 심어두는 번호(history.state.idx)입니다. #0이 앱의 첫 화면입니다."
                />
                <HintRow
                    label="뒤로 갈 수 있음"
                    value={currentIndex !== null && currentIndex > 0 ? '예' : '아니오'}
                    hint="현재 위치가 #0보다 위인지입니다. '아니오'면 앱 안에서 뒤로 갈 곳이 없어, 뒤로가기는 앱을 벗어납니다."
                />
                <HintRow
                    label="앞으로 남은 항목"
                    value={`${forwardCount}칸`}
                    hint="뒤로 온 뒤 앞으로가기로 다시 닿을 수 있는 항목 수입니다. 여기서 새 화면으로 이동하면 이 항목들은 버려집니다."
                />
                <HintRow
                    label="history.length"
                    value={String(historyLength)}
                    hint="브라우저 전역 값이라 앱에 들어오기 전 항목까지 셉니다. 앱 깊이가 아닙니다 — useBackHandler가 이 값으로 뒤로가기를 판정하는데, 그래서 위의 '뒤로 갈 수 있음'과 어긋날 수 있습니다."
                />
                {historyLength !== depth && depth > 0 && (
                    <HintRow
                        label="불일치"
                        value={`앱 스택 ${depth}칸 ≠ history.length ${historyLength}`}
                        hint="두 값의 차이가 앱에 들어오기 전 항목 수입니다. 웹뷰를 재사용했거나 브라우저 탭이 다른 사이트를 먼저 방문한 경우입니다."
                    />
                )}
            </Section>

            <Section title="스택 (뒤 → 앞)">
                {/* Always visible, not a hint: the reader needs to know what this list IS before
                    reading it, and the stack/trail distinction is the whole reason for two lists. */}
                <p className="text-muted-foreground pb-1 text-xs leading-snug">
                    지금 내 뒤에 쌓여 있는 것. 뒤로 간 뒤 새 화면으로 가면 앞쪽 항목은 버려집니다.
                </p>
                {!stack.isIndexed && (
                    <HintRow
                        label="경고"
                        value="스택을 신뢰할 수 없습니다"
                        hint="라우터를 거치지 않고 history를 직접 조작한 코드가 있습니다. 그러면 항목 번호를 읽을 수 없어 스택을 복원할 수 없습니다."
                    />
                )}
                {depth === 0 && <p className="text-muted-foreground text-xs">아직 기록된 전환이 없습니다</p>}
                {stack.entries.map(entry => (
                    <Row
                        key={entry.index}
                        label={`#${entry.index}${entry.isCurrent ? ' ← 현재' : ''}`}
                        value={entry.pathname ?? '(알 수 없음 — 리로드 이전)'}
                    />
                ))}
            </Section>

            <Section title="Trail (방문 순서)">
                <p className="text-muted-foreground pb-1 text-xs leading-snug">
                    거쳐온 화면을 시간순으로. 뒤로 간 화면도 남습니다. 피드백 리포트에 함께 실립니다.
                </p>
                {trail.length === 0 && <p className="text-muted-foreground text-xs">아직 방문 기록이 없습니다</p>}
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
