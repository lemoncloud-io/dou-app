import { countGraphRun, isSiblingGraphEntry, readFeatureGraph } from './featureGraph';

export type EntryKind = 'deeplink' | 'auth-transition' | 'push' | 'eviction' | 'in-app';

export interface EntryContext {
    from: string;
    to: string;
    depth: number | null;
    stack?: readonly (string | null)[];
}

export type EntryAction =
    | { kind: 'skip' }
    | { kind: 'push' }
    | { kind: 'replace' }
    | { kind: 'back' }
    | { kind: 'rewind-then-push'; steps: number };

const isChannelRoomPath = (pathname: string): boolean => /^\/channels\/[^/]+\/room$/.test(pathname);

const INVITE_ENTRY_PATHS = ['/s', '/i', '/invite/accept'];

const isInviteEntryPath = (pathname: string): boolean => INVITE_ENTRY_PATHS.includes(pathname);

const withoutHash = (location: string): string => location.split('#')[0];

const pathnameOf = (location: string): string => withoutHash(location).split('?')[0];

export const resolveEntryAction = (entry: EntryKind, ctx: EntryContext): EntryAction => {
    const from = withoutHash(ctx.from);
    const to = withoutHash(ctx.to);

    if (from === to) return { kind: 'skip' };

    const fromPath = pathnameOf(ctx.from);
    const toPath = pathnameOf(ctx.to);

    const canRewind = ctx.depth !== null && ctx.depth > 0;

    const collapseSiblingGraph = (): EntryAction | null => {
        if (!isSiblingGraphEntry(ctx.from, ctx.to)) return null;
        if (ctx.depth === null || ctx.depth <= 0) return null;

        const run = countGraphRun(ctx.stack ?? [], ctx.depth, readFeatureGraph(ctx.from));
        const steps = Math.min(run, ctx.depth);

        return steps > 0 ? { kind: 'rewind-then-push', steps } : null;
    };

    switch (entry) {
        case 'push':
            return collapseSiblingGraph() ?? (isChannelRoomPath(fromPath) ? { kind: 'replace' } : { kind: 'push' });

        case 'deeplink': {
            if (isInviteEntryPath(toPath)) return { kind: 'replace' };
            const collapsed = collapseSiblingGraph();
            if (collapsed) return collapsed;
            return canRewind ? { kind: 'back' } : { kind: 'replace' };
        }

        case 'auth-transition':
            return canRewind ? { kind: 'back' } : { kind: 'replace' };

        case 'eviction': {
            const below = ctx.depth !== null && ctx.depth > 0 ? ctx.stack?.[ctx.depth - 1] : undefined;
            const isBelow = below != null && below === toPath && to === toPath;
            return isBelow ? { kind: 'back' } : { kind: 'replace' };
        }

        case 'in-app':
            return { kind: 'push' };
    }
};
