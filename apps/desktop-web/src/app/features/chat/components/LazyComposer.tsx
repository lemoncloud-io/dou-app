import { Suspense, lazy } from 'react';

import type { ComposerProps } from './Composer';

const Composer = lazy(() => import('./Composer').then(module => ({ default: module.Composer })));

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
