import { Suspense, lazy } from 'react';

import type { ComposerProps } from './Composer';

// Lexical (composer) rides a separate chunk so opening a room paints the feed
// before the editor loads — composing is used sparingly, reading is not. Shared
// by the room pane and the thread panel, so both stay off the critical path.
const Composer = lazy(() => import('./Composer').then(module => ({ default: module.Composer })));

// Same footprint as the empty composer box (format row 36, text 43, actions 40, edges 2) so the
// feed does not jump when it resolves.
const ComposerFallback = ({ compact }: { compact?: boolean }) => (
    <div className={compact ? 'px-3 pb-3 pt-2' : 'bg-background px-6 pb-5 pt-2'} aria-hidden>
        <div className="h-[121px] rounded-2xl border border-control-border bg-background" />
    </div>
);

export const LazyComposer = (props: ComposerProps) => (
    <Suspense fallback={<ComposerFallback compact={props.compact} />}>
        <Composer {...props} />
    </Suspense>
);
