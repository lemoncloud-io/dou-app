import type { ConfigRuntimePorts, ConfigSnapshot, ValueOrigin } from '@chatic/config';
import type { RuntimeConfig, RuntimeEngine, RuntimePorts } from '@chatic/runtime-core';

/** A port the runtime takes from its platform — one field of `RuntimePorts`. */
export type PortName = keyof RuntimePorts;

/**
 * Every port, in the order `startRuntime` builds them. `storage` comes first because the others may be
 * built over its stores (a native process carries the address a session ended with in `plain`).
 */
export const PORT_NAMES = ['storage', 'transport', 'auth', 'cache', 'foreground'] as const;

type Assert<T extends true> = T;
/** Stops compiling when `RuntimePorts` gains a port `PORT_NAMES` does not list, or loses one it does. */
export type PortNamesAreComplete = Assert<
    [Exclude<PortName, (typeof PORT_NAMES)[number]>] extends [never]
        ? [Exclude<(typeof PORT_NAMES)[number], PortName>] extends [never]
            ? true
            : false
        : false
>;

/** An adapter's id: the port's name, a dot, and the adapter's own name — `cache.indexeddb`. */
export type AdapterId<P extends PortName> = `${P}.${string}`;

/**
 * What an adapter is built from. `storage` is built from the host facts alone; every other port may
 * also use the stores `storage` was built into, and nothing else — an adapter that needs one of the
 * app's own handles (a native module, a callback) takes it when its value is made, not here.
 */
export type AdapterContext<P extends PortName, Facts> = P extends 'storage'
    ? { readonly facts: Facts }
    : { readonly facts: Facts; readonly storage: RuntimePorts['storage'] };

/**
 * One way of filling one port, as a value an app imports and plugs into its declaration.
 *
 * `port` is what keeps an adapter in its own slot: a cache adapter handed to `storage` does not
 * compile. `id` is the name a config toggle uses to point at it; it is never looked up in a table of
 * every adapter, only among the candidates one declaration names for that port.
 */
export interface Adapter<P extends PortName, Impl extends RuntimePorts[P] = RuntimePorts[P], Facts = unknown> {
    readonly id: AdapterId<P>;
    readonly port: P;
    /**
     * Whether this host can run the adapter. Left out, every host can. A property rather than a
     * method, so an adapter that reads one platform's facts cannot be declared for another's.
     */
    readonly supports?: (facts: Facts) => boolean;
    /**
     * Builds the port. It may finish asynchronously — a store that has to be loaded before the runtime
     * reads it synchronously (the device vault) — and `startRuntime` waits for it.
     */
    readonly create: (context: AdapterContext<P, Facts>) => Impl | Promise<Impl>;
}

/** What a constraint and a log line need of an adapter: which one it is, and which port it fills. */
export interface AdapterRef {
    readonly id: string;
    readonly port: PortName;
}

/**
 * A config row that can name a port's adapter: one of config's lanes, a stage rule, or `build` — a
 * value the build supplied (`VITE_PORT_<PORT>`), which config reports as `default` like the empty
 * floor.
 */
export type ChoiceLane = Exclude<ValueOrigin, 'default'> | 'build';

/** Where a port's resolved adapter came from: a lane that chose it, or the declaration's default. */
export type ChoiceOrigin = ChoiceLane | 'default';

/** One port of a declaration: the adapter it runs by default and the ones a toggle may switch to. */
export interface PortDeclaration<P extends PortName, Facts> {
    readonly default: Adapter<P, RuntimePorts[P], Facts>;
    /** The other adapters a toggle may choose. None, and the port is fixed to its default. */
    readonly alternatives?: readonly Adapter<P, RuntimePorts[P], Facts>[];
    /**
     * The rows allowed to change this port. Left out, every row may; an empty list fixes the port to
     * its default whatever config says.
     */
    readonly override?: readonly ChoiceLane[];
}

/** A rule over the adapters chosen across ports, checked once every port has its choice. */
export type PortConstraint =
    /** Choosing `adapter` needs `needs` chosen for its own port. */
    | { readonly kind: 'requires'; readonly adapter: AdapterRef; readonly needs: AdapterRef }
    /** `adapter` and `other` cannot both be chosen. */
    | { readonly kind: 'conflicts'; readonly adapter: AdapterRef; readonly other: AdapterRef };

/**
 * What an app declares about its runtime: how to read its host, which adapter fills each port by
 * default and which others it allows, and the rules between them. Everything an app hands the runtime
 * beyond the ports rides along, so `startRuntime` needs nothing else.
 */
export interface RuntimeDeclaration<Facts> {
    /** The app's name, carried into the log lines. */
    readonly name: string;
    /** Reads the host facts the adapters' `supports` is asked about. Called once, at start. */
    readonly facts: () => Facts;
    readonly ports: { readonly [P in PortName]: PortDeclaration<P, NoInfer<Facts>> };
    readonly constraints?: readonly PortConstraint[];
    /** The key prefixes this app's own domains say a sign-out takes. */
    readonly signedOutKeyPrefixes?: RuntimeConfig['signedOutKeyPrefixes'];
    /** The app's repository and cache policies. */
    readonly data?: RuntimeConfig['data'];
    /**
     * The ports `@chatic/config` is initialised with, when the app leaves that to `startRuntime`. Left
     * out, the app has called `config.init` itself before starting the runtime.
     */
    readonly config?: ConfigRuntimePorts;
}

/** How one port was settled. */
export interface PortChoice<P extends PortName = PortName, Facts = unknown> {
    readonly port: P;
    readonly adapter: Adapter<P, RuntimePorts[P], Facts>;
    /** The chosen adapter's id. */
    readonly id: string;
    readonly origin: ChoiceOrigin;
    /** Set when a row asked for another adapter and the port fell back to its default. */
    readonly fellBack?: {
        /** The id the row asked for. */
        readonly requested: string;
        /** The row it came from. */
        readonly from: ChoiceLane;
        readonly because: string;
    };
}

/** A choice without its adapter value — what a log line or a report needs. */
export type PortChoiceSummary = Omit<PortChoice, 'adapter'>;

/** Every port's choice. */
export type PortChoices<Facts = unknown> = { readonly [P in PortName]: PortChoice<P, Facts> };

/** The config key a port's toggle lives under. */
export type PortChoiceKey = `port.${PortName}`;

/**
 * Reads a port's toggle with the row it came from — in production, `config.snapshot(key)`. `undefined`
 * reads as no toggle at all.
 */
export type PortChoiceReader = (key: PortChoiceKey) => Pick<ConfigSnapshot, 'value' | 'origin'> | undefined;

/** What `startRuntime` hands back. */
export interface StartedRuntime<Facts> {
    readonly engine: RuntimeEngine;
    readonly choices: PortChoices<Facts>;
    readonly facts: Facts;
}
