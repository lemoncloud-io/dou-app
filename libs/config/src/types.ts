/**
 * The vocabulary every other module in this lib speaks.
 *
 * `Stage` and `Platform` are declared here rather than imported from `@chatic/app-messages` on
 * purpose. Importing that lib would chain this one to the whole bridge contract — hundreds of
 * message types that mobile and every test would then carry — to gain two unions. The cost of the
 * copy is a single normalization point in each app's env adapter, and a test on the app side
 * (which may import both) asserts the two sets stay equal. See ADR-0079 결정 14.
 *
 * `Stage` has three members because this repo has three. `VITE_ENV` is only ever compared against
 * 'LOCAL', 'DEV' and 'PROD', and the deploy workflows carry only `_DEV_ENV` and `_PROD_ENV`.
 * A fourth value is added to this union the day a fourth environment exists.
 */
export type Stage = 'LOCAL' | 'DEV' | 'PROD';

export type Platform = 'ios' | 'android' | 'windows' | 'macos' | 'web';

/** A source that can supply a value. Ordered by precedence in `ConfigLanePolicy`. */
export type Lane = 'serverEnforced' | 'shell' | 'local' | 'serverDefault';

/** Where a resolved value actually came from. The last two are registry declarations, not lanes. */
export type ValueOrigin = Lane | 'stageRule' | 'default';

/** Who may write a key. `server` covers both server lanes. */
export type Writer = 'shell' | 'local' | 'server';

/**
 * Which screen shows a control for this key. Orthogonal to the key's domain (its dotted prefix)
 * and to `writableBy`.
 *
 *  'user'     Settings. A normal person turns it on and off.
 *  'labs'     The experimental section of Settings. Default off, and the server must be able to
 *             kill it — an experiment nobody can turn off remotely does not ship to users.
 *  'dev'      The debug panel only. Requires the unlock.
 *  'internal' No control anywhere. Code reads it, or product UI writes it through its own flow.
 */
export type Surface = 'user' | 'labs' | 'dev' | 'internal';

export type ValueType = 'boolean' | 'string' | 'number' | 'enum' | 'json';

/** Where an override for this key is stored. 'none' means it lives only in memory. */
export type Persist = 'shell' | 'local' | 'session' | 'none';

/**
 * When a change actually takes effect.
 *
 * Descriptive metadata for the UI, not an enforcement mechanism — this lib never forces a
 * reconnect. Getting it wrong makes a panel claim it turned something off that is still on, which
 * is worse than showing nothing, so the default is the pessimistic one: state `'live'` only after
 * checking that the consumer re-reads the value (a subscriber, or a per-call default argument).
 * A value captured into an instance field at construction is `'restart'`.
 */
export type AppliesAt = 'live' | 'reconnect' | 'restart';

/**
 * What a key MEANS. Authored in the registry, frozen at runtime.
 *
 * Everything here except the value itself is policy, and no lane may change it (ADR-0079 결정 6).
 * The current value is deliberately absent — putting it here would make the registry mutable and
 * remove the structure that keeps policy fixed. `ConfigSnapshot` is the read-only pairing of a
 * declaration with its resolved value.
 */
export interface ConfigEntry<T = unknown> {
    /** Human name the panel shows instead of the dotted key. Korean (ADR-0080 결정 3). */
    title: string;
    /** One sentence: what this changes, and why it exists when that is not obvious. */
    description: string;
    type: ValueType;
    /** Allowed values when `type` is 'enum'. */
    values?: readonly T[];
    /** The answer when no lane supplies one and no stage rule matches. */
    defaultValue: T;
    /** Per-stage default. Security-relevant keys are judged against the build stage. */
    byStage?: Partial<Record<Stage, T>>;
    byPlatform?: Partial<Record<Platform, T>>;
    /**
     * Raw build value this key's default is sourced from, for keys whose default is not a fixed
     * literal but a per-app build value (an endpoint, a version string). Consulted after a declared
     * `byStage`/`byPlatform` rule misses and before the literal `defaultValue` floor — a rule the
     * registry itself asserts still outranks a generic build-time passthrough.
     *
     * Absent for the three keys the resolver reads directly off the adapter (`env.stage` ·
     * `env.buildStage` · `env.platform`) — those bypass this mechanism entirely.
     */
    envDefaultKey?: string;
    surface: Surface;
    writableBy: readonly Writer[];
    persist: Persist;
    appliesAt?: AppliesAt;
    /**
     * This key is part of the lock machinery.
     *
     * Two consequences, both from that one fact. The generic panel does not render an editor for it
     * (otherwise the screen you need the unlock to reach would contain the switch that unlocks it),
     * and the local lane's unlock gate does not apply to it (otherwise resolving the unlock key
     * would ask for the unlock key). A dedicated flow — the tap counter plus the entry code — is
     * what guards these instead.
     */
    meta?: boolean;
}

/** One key's whole current state. Built by the resolver; what a panel row needs. */
export interface ConfigSnapshot<T = unknown> {
    key: string;
    /** The declaration, unchanged. */
    entry: ConfigEntry<T>;
    value: T;
    /** Which row won. */
    origin: ValueOrigin;
    /** Whether something other than the registry's own rules decided this. */
    isOverridden: boolean;
    /**
     * Who may write it ON THIS DEVICE RIGHT NOW.
     *
     * Different from `entry.writableBy`, which says who may write it in principle. This reflects
     * the lock and which adapters are actually wired, so a panel never renders a live control for
     * something it cannot change.
     */
    canWrite: readonly Writer[];
}

/**
 * Told which keys moved, so an observer does not have to diff to find out.
 *
 * The store already knows — it is handed the changed keys to decide who to call — and dropping them
 * on the way to the listener is what would force every observer to keep a shadow copy of the values
 * it watches. Callers that do not care (React's `useSyncExternalStore`, which just re-reads) may
 * ignore the argument.
 */
export type ConfigChangeListener = (changedKeys: readonly string[]) => void;

export type SetRejection = 'unknownKey' | 'laneNotAllowed' | 'locked' | 'invalidValue' | 'notWired';

/** `set` reports refusals instead of throwing — a debug panel should show the reason, not crash. */
export type SetResult = { ok: true } | { ok: false; reason: SetRejection };

/** A registry module: one domain's keys. */
export type ConfigRegistryModule = Readonly<Record<string, ConfigEntry>>;
