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
