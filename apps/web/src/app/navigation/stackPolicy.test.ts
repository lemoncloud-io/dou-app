import { resolveEntryAction, type EntryContext, type EntryKind } from './stackPolicy';

/** Warm by default — most rows are about which screen we are on, not how deep. */
const at = (from: string, to: string, depth: number | null = 2): EntryContext => ({ from, to, depth });
const act = (entry: EntryKind, ctx: EntryContext) => resolveEntryAction(entry, ctx).kind;

const ROOM = '/channels/c1/room';
const LOGIN = '/mypage/login';
const ACCEPT = '/invite/accept';

describe('resolveEntryAction — the same-target rule, which outranks every kind', () => {
    // Re-entering the screen you are on remounts it (scroll and input reset) and leaves a duplicate
    // entry, so back appears to do nothing once.
    it.each<EntryKind>(['push', 'deeplink', 'auth-transition', 'in-app'])('skips for %s', entry => {
        expect(act(entry, at('/mypage', '/mypage'))).toBe('skip');
    });

    // The invite payload rides in the query, so a same-pathname/different-query target is a real
    // move. Treating it as "already there" used to swallow the invite when the reader was at home.
    it('does not skip when only the query differs', () => {
        expect(act('deeplink', at('/', '/?provider=invite&code=abc'))).not.toBe('skip');
    });

    // The fragment never names a different screen.
    it('ignores the hash when comparing', () => {
        expect(act('push', at('/mypage', '/mypage#section'))).toBe('skip');
    });
});

describe('resolveEntryAction — push', () => {
    // A room is the only disposable screen: rooms are peers a push hops between.
    it('replaces when leaving a channel room', () => {
        expect(act('push', at(ROOM, '/channels/c2/room'))).toBe('replace');
    });

    // The rule deliberately is NOT "anywhere but home". It used to be, and a push tapped from
    // mypage deleted mypage — leaving nothing to go back to when it was the only entry.
    it.each(['/mypage', '/', '/search', '/channels/c1/thread/9'])('pushes when leaving %s', from => {
        expect(act('push', at(from, ROOM))).toBe('push');
    });

    // A thread is not a room, even though it lives under the same channel.
    it('pushes when leaving a thread', () => {
        expect(act('push', at('/channels/c1/thread/3', ROOM))).toBe('push');
    });

    it('is unaffected by depth', () => {
        expect(act('push', at(ROOM, '/channels/c2/room', 0))).toBe('replace');
        expect(act('push', at('/mypage', ROOM, 0))).toBe('push');
    });
});

describe('resolveEntryAction — deeplink', () => {
    // The redirect chain that carries an invite inwards must not leave entries behind.
    it.each(['/s', '/i', ACCEPT])('replaces on the way into %s', to => {
        expect(act('deeplink', at('/', to))).toBe('replace');
    });

    // Warm entry: the app was already open, so the screen the reader was on is still underneath.
    it('rewinds when leaving the invite with somewhere to go back to', () => {
        expect(act('deeplink', at(ACCEPT, '/', 3))).toBe('back');
    });

    // Cold entry: the link launched the app, so there is nothing underneath to rewind onto.
    it('replaces when leaving the invite at the first entry', () => {
        expect(act('deeplink', at(ACCEPT, '/', 0))).toBe('replace');
    });

    // Rewinding to a place we cannot locate is worse than not rewinding.
    it('replaces rather than rewinding when the depth is unreadable', () => {
        expect(act('deeplink', at(ACCEPT, '/', null))).toBe('replace');
    });
});

describe('resolveEntryAction — auth-transition (leaving login)', () => {
    // The kind only ever means LEAVING. Entering login is `useNavigateToLogin`'s, and the repo pins
    // that with `loginEntryPoints.test.ts` — nothing else may even name the route. That hook pushes,
    // which is what leaves the origin screen underneath for this rewind to land on.
    it('rewinds regardless of where the caller says it is going', () => {
        expect(act('auth-transition', at(LOGIN, '/mypage', 2))).toBe('back');
        expect(act('auth-transition', at(LOGIN, '/search', 2))).toBe('back');
    });

    it('rewinds when leaving login with somewhere to go back to', () => {
        expect(act('auth-transition', at(LOGIN, '/', 2))).toBe('back');
    });

    // A fresh WebView load, a deep link, or a reload landed straight on login.
    it('replaces when leaving login at the first entry', () => {
        expect(act('auth-transition', at(LOGIN, '/', 0))).toBe('replace');
    });

    it('replaces rather than rewinding when the depth is unreadable', () => {
        expect(act('auth-transition', at(LOGIN, '/', null))).toBe('replace');
    });
});

describe('resolveEntryAction — in-app', () => {
    // The kind exists so "we deliberately decide nothing here" is written down rather than missing.
    it('always pushes', () => {
        expect(act('in-app', at('/mypage', '/search'))).toBe('push');
        expect(act('in-app', at(ROOM, '/search', 0))).toBe('push');
    });
});

describe('resolveEntryAction — never rewinds without a readable index', () => {
    // The one outcome the module refuses outright, across every kind.
    it.each<EntryKind>(['push', 'deeplink', 'auth-transition', 'in-app'])(
        '%s never returns back at null depth',
        entry => {
            expect(act(entry, at(ACCEPT, '/', null))).not.toBe('back');
            expect(act(entry, at(LOGIN, '/', null))).not.toBe('back');
        }
    );

    it.each<EntryKind>(['push', 'deeplink', 'auth-transition', 'in-app'])('%s never returns back at depth 0', entry => {
        expect(act(entry, at(ACCEPT, '/', 0))).not.toBe('back');
        expect(act(entry, at(LOGIN, '/', 0))).not.toBe('back');
    });
});

describe('resolveEntryAction — collapsing a feature graph', () => {
    /**
     * The graph rule is the only one that reads more than the top of the stack, so these rows build
     * a whole stack. `depth` is the cursor's history index, which is also the last position.
     */
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

    // The reported case. `[home, roomA, settingsA]` used to push channel B on top, so back landed
    // the reader in settings for a channel they had already left.
    it('rewinds the whole of channel A before entering channel B', () => {
        const action = resolveEntryAction('push', onStack([HOME, A_ROOM, A_SETTINGS], B_ROOM));

        expect(action).toEqual({ kind: 'rewind-then-push', steps: 2 });
    });

    it('does the same for a deeplink, which is the way the case was reported', () => {
        const action = resolveEntryAction('deeplink', onStack([HOME, A_ROOM, A_SETTINGS], B_ROOM));

        expect(action).toEqual({ kind: 'rewind-then-push', steps: 2 });
    });

    // One entry of the graph collapses to the same thing the old room rule did, by another name.
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

    // Forward movement inside one channel has to keep stacking or back stops working inside it.
    // Read from settings rather than from the room, because leaving a ROOM has a rule of its own
    // (it replaces) that would mask what this row is about.
    it('does not collapse when moving within the same channel', () => {
        expect(act('push', onStack([HOME, A_ROOM, A_SETTINGS], '/channels/A/invite'))).toBe('push');
    });

    // The rule that was paid for once already: a push tapped from mypage must not delete mypage.
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

    // Rewinding past index 0 leaves the app entirely.
    it('never rewinds past the app first entry', () => {
        const action = resolveEntryAction('push', onStack([A_ROOM, A_SETTINGS], B_ROOM));

        expect(action).toEqual({ kind: 'rewind-then-push', steps: 1 });
    });

    it('does nothing to collapse when the graph is the app first entry', () => {
        expect(act('push', onStack([A_ROOM], B_ROOM, 0))).toBe('replace');
    });

    // Without a reconstruction to read, the rule declines rather than guessing a step count.
    it('falls back to the single-entry rules when no stack is supplied', () => {
        expect(act('push', { from: A_SETTINGS, to: B_ROOM, depth: 2 })).toBe('push');
        expect(act('push', { from: A_ROOM, to: B_ROOM, depth: 1 })).toBe('replace');
    });

    // An unobserved entry is not evidence, so the run stops there and rewinds too little rather
    // than dropping a screen it cannot see.
    it('stops at an entry the tracker never observed', () => {
        const action = resolveEntryAction('push', onStack([HOME, null, A_ROOM, A_SETTINGS], B_ROOM));

        expect(action).toEqual({ kind: 'rewind-then-push', steps: 2 });
    });

    // The invite redirect hop still outranks the graph rule: it must leave no entry behind.
    it('keeps the invite redirect as a replace', () => {
        expect(act('deeplink', onStack([HOME, A_ROOM, A_SETTINGS], '/invite/accept'))).toBe('replace');
    });
});
