import { useCallback, useEffect, useState } from 'react';

import { CopyButton } from '../../components/CopyButton';
import { HintRow } from '../../components/HintRow';
import { Row } from '../../components/Row';
import { Section } from '../../components/Section';
import { useRouteScreenStrings } from '../../i18n/screens/RouteScreen';
import { getRouteTrail } from '../../../../utils/routeTrail';
import { canGoBackInApp, routeStackTracker, type RouteStackSnapshot } from '../../../../navigation';

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
    const t = useRouteScreenStrings();
    const [stack, setStack] = useState<RouteStackSnapshot>(() => routeStackTracker.getSnapshot());
    const [trail, setTrail] = useState<string[]>(() => getRouteTrail());
    const [historyLength, setHistoryLength] = useState(() => window.history.length);
    // Asked of the same function the back button asks, rather than derived from the snapshot
    // above. The two agree in the ordinary cases, but a pushState that bypassed the router kills
    // the live index while the tracker still shows its last observed one — and this row saying
    // "yes" while back does nothing is the exact confusion this screen exists to prevent.
    const [canGoBack, setCanGoBack] = useState(() => canGoBackInApp());

    // Polled, like the Perf screen: the stores are plain module state with no subscription, and the
    // panel is only open while someone is watching it.
    useEffect(() => {
        const poll = () => {
            setStack(routeStackTracker.getSnapshot());
            setTrail(getRouteTrail());
            setHistoryLength(window.history.length);
            setCanGoBack(canGoBackInApp());
        };
        poll();
        const id = setInterval(poll, 1000);
        return () => clearInterval(id);
    }, []);

    const depth = stack.entries.length;
    const { currentIndex } = stack;
    const forwardCount = currentIndex === null ? 0 : Math.max(0, depth - currentIndex - 1);

    const snapshot = useCallback(
        () => JSON.stringify({ depth, currentIndex, canGoBack, forwardCount, historyLength, stack, trail }, null, 2),
        [depth, currentIndex, canGoBack, forwardCount, historyLength, stack, trail]
    );

    return (
        <div className="space-y-3 p-4">
            <div className="flex justify-end">
                <CopyButton value={snapshot} label={t.copyRoute} />
            </div>

            <Section title={t.summary.title}>
                <HintRow
                    label={t.summary.depth.label}
                    value={depth ? t.summary.depth.value(depth) : null}
                    hint={t.summary.depth.hint}
                />
                <HintRow
                    label={t.summary.currentPosition.label}
                    value={currentIndex === null ? null : `#${currentIndex}`}
                    hint={t.summary.currentPosition.hint}
                />
                <HintRow
                    label={t.summary.canGoBack.label}
                    value={canGoBack ? t.summary.canGoBack.yes : t.summary.canGoBack.no}
                    hint={t.summary.canGoBack.hint}
                />
                <HintRow
                    label={t.summary.forwardRemaining.label}
                    value={t.summary.forwardRemaining.value(forwardCount)}
                    hint={t.summary.forwardRemaining.hint}
                />
                <HintRow
                    label={t.summary.historyLength.label}
                    value={String(historyLength)}
                    hint={t.summary.historyLength.hint}
                />
                {historyLength !== depth && depth > 0 && (
                    <HintRow
                        label={t.summary.mismatch.label}
                        value={t.summary.mismatch.value(depth, historyLength)}
                        hint={t.summary.mismatch.hint}
                    />
                )}
            </Section>

            <Section title={t.stack.title}>
                {/* Always visible, not a hint: the reader needs to know what this list IS before
                    reading it, and the stack/trail distinction is the whole reason for two lists. */}
                <p className="text-muted-foreground pb-1 text-xs leading-snug">{t.stack.description}</p>
                {!stack.isIndexed && (
                    <HintRow label={t.stack.warningLabel} value={t.stack.warningValue} hint={t.stack.warningHint} />
                )}
                {depth === 0 && <p className="text-muted-foreground text-xs">{t.stack.empty}</p>}
                {stack.entries.map(entry => (
                    <Row
                        key={entry.index}
                        label={`#${entry.index}${entry.isCurrent ? t.stack.currentSuffix : ''}`}
                        value={entry.pathname ?? t.stack.unknownEntry}
                    />
                ))}
            </Section>

            <Section title={t.trail.title}>
                <p className="text-muted-foreground pb-1 text-xs leading-snug">{t.trail.description}</p>
                {trail.length === 0 && <p className="text-muted-foreground text-xs">{t.trail.empty}</p>}
                {trail.map((pathname, order) => (
                    <Row
                        key={`${order}-${pathname}`}
                        label={order === trail.length - 1 ? t.trail.current : `${order + 1}`}
                        value={pathname}
                    />
                ))}
            </Section>
        </div>
    );
};
