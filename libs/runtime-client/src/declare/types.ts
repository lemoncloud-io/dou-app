import type { ConfigRuntimePorts, ConfigSnapshot, ValueOrigin } from '@chatic/config';
import type { RuntimeConfig, RuntimeEngine, RuntimePorts } from '@chatic/runtime-core';

import type { HostPortName } from '@chatic/ports';

import type { HostPorts } from '../host/ports';

export type PortName = keyof RuntimePorts;

export const PORT_NAMES = ['storage', 'transport', 'auth', 'cache', 'foreground'] as const;

type Assert<T extends true> = T;
export type PortNamesAreComplete = Assert<
    [Exclude<PortName, (typeof PORT_NAMES)[number]>] extends [never]
        ? [Exclude<(typeof PORT_NAMES)[number], PortName>] extends [never]
            ? true
            : false
        : false
>;

export type { HostPortName };

export type SlotName = PortName | HostPortName | 'engine';

export type AdapterId<P extends SlotName> = `${P}.${string}`;

export type SessionOwnerSide = 'web' | 'native';

export type AdapterContext<P extends PortName, Facts> = P extends 'storage'
    ? { readonly facts: Facts; readonly sessionOwner?: SessionOwnerSide }
    : { readonly facts: Facts; readonly storage: RuntimePorts['storage'] };

export interface Adapter<P extends PortName, Impl extends RuntimePorts[P] = RuntimePorts[P], Facts = unknown> {
    readonly id: AdapterId<P>;
    readonly port: P;
    readonly supports?: (facts: Facts) => boolean;
    readonly create: (context: AdapterContext<P, Facts>) => Impl | Promise<Impl>;
}

export interface HostAdapter<P extends HostPortName, Impl extends HostPorts[P] = HostPorts[P], Facts = unknown> {
    readonly id: AdapterId<P>;
    readonly port: P;
    readonly supports?: (facts: Facts) => boolean;
    readonly create: (context: { readonly facts: Facts }) => Impl;
}

export interface EngineContext<Facts> {
    readonly facts: Facts;
    readonly core: (options?: { readonly sessionOwner?: SessionOwnerSide }) => Promise<RuntimeEngine>;
}

export interface EngineOutcome<Owner> {
    readonly engine: RuntimeEngine | null;
    readonly owner?: Owner;
}

export interface EngineAdapter<Facts = unknown, Owner = unknown> {
    readonly id: AdapterId<'engine'>;
    readonly port: 'engine';
    readonly supports?: (facts: Facts) => boolean;
    readonly create: (context: EngineContext<Facts>) => EngineOutcome<Owner> | Promise<EngineOutcome<Owner>>;
}

export type AdapterOf<S extends SlotName, Facts> = [S] extends [PortName]
    ? Adapter<S, RuntimePorts[S], Facts>
    : [S] extends [HostPortName]
      ? HostAdapter<S, HostPorts[S], Facts>
      : EngineAdapter<Facts>;

export interface AdapterRef {
    readonly id: string;
    readonly port: PortName;
}

export type ChoiceLane = Exclude<ValueOrigin, 'default'> | 'build';

export type ChoiceOrigin = ChoiceLane | 'default';

export interface PortDeclaration<P extends PortName, Facts> {
    readonly default: Adapter<P, RuntimePorts[P], Facts>;
    readonly alternatives?: readonly Adapter<P, RuntimePorts[P], Facts>[];
    readonly override?: readonly ChoiceLane[];
}

export interface HostPortDeclaration<P extends HostPortName, Facts> {
    readonly default: HostAdapter<P, HostPorts[P], Facts>;
    readonly alternatives?: readonly HostAdapter<P, HostPorts[P], Facts>[];
    readonly override?: readonly ChoiceLane[];
}

export interface EngineDeclaration<Facts, Owner> {
    readonly default: EngineAdapter<Facts, Owner>;
    readonly alternatives?: readonly EngineAdapter<Facts, Owner>[];
    readonly override?: readonly ChoiceLane[];
}

export type HostPortDeclarations<Facts> = { readonly [P in HostPortName]: HostPortDeclaration<P, Facts> };

export type PortConstraint =
    | { readonly kind: 'requires'; readonly adapter: AdapterRef; readonly needs: AdapterRef }
    | { readonly kind: 'conflicts'; readonly adapter: AdapterRef; readonly other: AdapterRef };

export interface RuntimeDeclaration<Facts, Owner = never> {
    readonly name: string;
    readonly facts: () => Facts;
    readonly ports: { readonly [P in PortName]: PortDeclaration<P, NoInfer<Facts>> };
    readonly host?: HostPortDeclarations<NoInfer<Facts>>;
    readonly engine?: EngineDeclaration<NoInfer<Facts>, Owner>;
    readonly constraints?: readonly PortConstraint[];
    readonly signedOutKeyPrefixes?: RuntimeConfig['signedOutKeyPrefixes'];
    readonly data?: RuntimeConfig['data'];
    readonly config?: ConfigRuntimePorts;
}

export interface PortChoice<P extends SlotName = PortName, Facts = unknown> {
    readonly port: P;
    readonly adapter: AdapterOf<P, Facts>;
    readonly id: string;
    readonly origin: ChoiceOrigin;
    readonly fellBack?: {
        readonly requested: string;
        readonly from: ChoiceLane;
        readonly because: string;
    };
}

export type PortChoiceSummary = Omit<PortChoice<SlotName>, 'adapter'>;

export type PortChoices<Facts = unknown> = { readonly [P in PortName]: PortChoice<P, Facts> };

export type HostPortChoices<Facts = unknown> = { readonly [P in HostPortName]: PortChoice<P, Facts> };

export type PortChoiceKey = `port.${SlotName}`;

export type PortChoiceReader = (key: PortChoiceKey) => Pick<ConfigSnapshot, 'value' | 'origin'> | undefined;

export interface StartedRuntime<Facts, Owner = never> {
    readonly engine: RuntimeEngine | null;
    readonly choices: PortChoices<Facts>;
    readonly hostChoices?: HostPortChoices<Facts>;
    readonly engineChoice: PortChoice<'engine', Facts>;
    readonly facts: Facts;
    readonly owner?: Owner;
}
