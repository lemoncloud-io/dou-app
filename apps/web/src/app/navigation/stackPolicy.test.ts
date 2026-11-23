import { resolveEntryAction, type EntryContext, type EntryKind } from './stackPolicy';

const at = (from: string, to: string, depth: number | null = 2): EntryContext => ({ from, to, depth });
const act = (entry: EntryKind, ctx: EntryContext) => resolveEntryAction(entry, ctx).kind;

const ROOM = '/channels/c1/room';
const LOGIN = '/mypage/login';
const ACCEPT = '/invite/accept';

describe('resolveEntryAction — the same-target rule, which outranks every kind', () => {
    it.each<EntryKind>(['push', 'deeplink', 'auth-transition', 'eviction', 'in-app'])('skips for %s', entry => {
        expect(act(entry, at('/mypage', '/mypage'))).toBe('skip');
    });

    it('does not skip when only the query differs', () => {
        expect(act('deeplink', at('/', '/?provider=invite&code=abc'))).not.toBe('skip');
    });

    it('ignores the hash when comparing', () => {
        expect(act('push', at('/mypage', '/mypage#section'))).toBe('skip');
    });
});

describe('resolveEntryAction — push', () => {
    it('replaces when leaving a channel room', () => {
        expect(act('push', at(ROOM, '/channels/c2/room'))).toBe('replace');
    });

    it.each(['/mypage', '/', '/search', '/channels/c1/thread/9'])('pushes when leaving %s', from => {
        expect(act('push', at(from, ROOM))).toBe('push');
    });

    it('pushes when leaving a thread', () => {
        expect(act('push', at('/channels/c1/thread/3', ROOM))).toBe('push');
    });

    it('is unaffected by depth', () => {
        expect(act('push', at(ROOM, '/channels/c2/room', 0))).toBe('replace');
        expect(act('push', at('/mypage', ROOM, 0))).toBe('push');
    });
});

describe('resolveEntryAction — deeplink', () => {
    it.each(['/s', '/i', ACCEPT])('replaces on the way into %s', to => {
        expect(act('deeplink', at('/', to))).toBe('replace');
    });

    it('rewinds when leaving the invite with somewhere to go back to', () => {
        expect(act('deeplink', at(ACCEPT, '/', 3))).toBe('back');
    });

    it('replaces when leaving the invite at the first entry', () => {
        expect(act('deeplink', at(ACCEPT, '/', 0))).toBe('replace');
    });

    it('replaces rather than rewinding when the depth is unreadable', () => {
        expect(act('deeplink', at(ACCEPT, '/', null))).toBe('replace');
    });
});

describe('resolveEntryAction — auth-transition (leaving login)', () => {
    it('rewinds regardless of where the caller says it is going', () => {
        expect(act('auth-transition', at(LOGIN, '/mypage', 2))).toBe('back');
        expect(act('auth-transition', at(LOGIN, '/search', 2))).toBe('back');
    });

    it('rewinds when leaving login with somewhere to go back to', () => {
        expect(act('auth-transition', at(LOGIN, '/', 2))).toBe('back');
    });

    it('replaces when leaving login at the first entry', () => {
        expect(act('auth-transition', at(LOGIN, '/', 0))).toBe('replace');
    });

    it('replaces rather than rewinding when the depth is unreadable', () => {
        expect(act('auth-transition', at(LOGIN, '/', null))).toBe('replace');
    });
});

describe('resolveEntryAction — in-app', () => {
    it('always pushes', () => {
        expect(act('in-app', at('/mypage', '/search'))).toBe('push');
        expect(act('in-app', at(ROOM, '/search', 0))).toBe('push');
    });
});

describe('resolveEntryAction — eviction (leaving a room I am not in)', () => {
    const HOME = '/';
    const evict = (stack: (string | null)[] | undefined, depth: number | null, to = HOME): EntryContext => ({
        from: ROOM,
        to,
        depth,
        stack,
    });

    it('rewinds onto home when home is directly underneath', () => {
        expect(act('eviction', evict([HOME, ROOM], 1))).toBe('back');
    });

    it('reads the entry directly below the cursor', () => {
        expect(act('eviction', evict(['/mypage', HOME, ROOM], 2))).toBe('back');
        expect(act('eviction', evict([HOME, '/search', ROOM], 2))).toBe('replace');
    });

    it.each(['/search', '/mypage', '/channels/c0/thread/3'])('replaces when %s is underneath', below => {
        expect(act('eviction', evict([HOME, below, ROOM], 2))).toBe('replace');
    });

    it('replaces at the first entry', () => {
        expect(act('eviction', evict([ROOM], 0))).toBe('replace');
    });

    it('replaces when the entry underneath is unknown', () => {
        expect(act('eviction', evict([null, ROOM], 1))).toBe('replace');
        expect(act('eviction', evict(undefined, 1))).toBe('replace');
    });

    it('replaces when the target carries a query', () => {
        expect(act('eviction', evict([HOME, ROOM], 1, '/?tab=chat'))).toBe('replace');
    });
});

describe('resolveEntryAction — never rewinds without a readable index', () => {
    it.each<EntryKind>(['push', 'deeplink', 'auth-transition', 'eviction', 'in-app'])(
        '%s never returns back at null depth',
        entry => {
            expect(act(entry, at(ACCEPT, '/', null))).not.toBe('back');
            expect(act(entry, at(LOGIN, '/', null))).not.toBe('back');
        }
    );

    it.each<EntryKind>(['push', 'deeplink', 'auth-transition', 'eviction', 'in-app'])(
        '%s never returns back at depth 0',
        entry => {
            expect(act(entry, at(ACCEPT, '/', 0))).not.toBe('back');
            expect(act(entry, at(LOGIN, '/', 0))).not.toBe('back');
        }
    );
});

describe('resolveEntryAction — collapsing a feature graph', () => {
    const onStack = (stack: (string | null)[], to: string, depth = stack.length - 1): EntryContext => ({
        from: stack[depth] ?? '/',
        to,
        depth,
        stack,
    });

    const HOME = '/';
    const A_ROOM = '/channels/A/room';
    const A_SETTINGS = '/channels/A/settings';
    const B_ROOM = '/channels/B/room';

    it('rewinds the whole of channel A before entering channel B', () => {
        const action = resolveEntryAction('push', onStack([HOME, A_ROOM, A_SETTINGS], B_ROOM));

        expect(action).toEqual({ kind: 'rewind-then-push', steps: 2 });
    });

    it('does the same for a deeplink, which is the way the case was reported', () => {
        const action = resolveEntryAction('deeplink', onStack([HOME, A_ROOM, A_SETTINGS], B_ROOM));

        expect(action).toEqual({ kind: 'rewind-then-push', steps: 2 });
    });

    it('rewinds one entry when only the room is open', () => {
        expect(resolveEntryAction('push', onStack([HOME, A_ROOM], B_ROOM))).toEqual({
            kind: 'rewind-then-push',
            steps: 1,
        });
    });

    it('stops at the screen the reader entered the graph from', () => {
        const action = resolveEntryAction('push', onStack([HOME, '/mypage', A_ROOM, A_SETTINGS], B_ROOM));

        expect(action).toEqual({ kind: 'rewind-then-push', steps: 2 });
    });

    it('does not collapse when moving within the same channel', () => {
        expect(act('push', onStack([HOME, A_ROOM, A_SETTINGS], '/channels/A/invite'))).toBe('push');
    });

    it('does not collapse across features', () => {
        expect(act('push', onStack([HOME, '/mypage'], B_ROOM))).toBe('push');
    });

    it('collapses a place graph too, the other instance-scoped feature', () => {
        const stack = [HOME, '/place/P1/settings', '/place/P1/settings/edit'];

        expect(resolveEntryAction('push', onStack(stack, '/place/P2'))).toEqual({
            kind: 'rewind-then-push',
            steps: 2,
        });
    });

    it('never rewinds past the app first entry', () => {
        const action = resolveEntryAction('push', onStack([A_ROOM, A_SETTINGS], B_ROOM));

        expect(action).toEqual({ kind: 'rewind-then-push', steps: 1 });
    });

    it('does nothing to collapse when the graph is the app first entry', () => {
        expect(act('push', onStack([A_ROOM], B_ROOM, 0))).toBe('replace');
    });

    it('falls back to the single-entry rules when no stack is supplied', () => {
        expect(act('push', { from: A_SETTINGS, to: B_ROOM, depth: 2 })).toBe('push');
        expect(act('push', { from: A_ROOM, to: B_ROOM, depth: 1 })).toBe('replace');
    });

    it('stops at an entry the tracker never observed', () => {
        const action = resolveEntryAction('push', onStack([HOME, null, A_ROOM, A_SETTINGS], B_ROOM));

        expect(action).toEqual({ kind: 'rewind-then-push', steps: 2 });
    });

    it('keeps the invite redirect as a replace', () => {
        expect(act('deeplink', onStack([HOME, A_ROOM, A_SETTINGS], '/invite/accept'))).toBe('replace');
    });
});
