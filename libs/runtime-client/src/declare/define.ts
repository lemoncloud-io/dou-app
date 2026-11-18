import type { RuntimePorts } from '@chatic/runtime-core';

import type { Adapter, AdapterRef, PortConstraint, PortName, RuntimeDeclaration } from './types';

/**
 * An app's runtime declaration, unchanged. It exists for its types: the facts reader fixes what every
 * adapter's `supports` is asked about, each of the five ports must be declared, and an adapter can only
 * sit in the port it fills.
 */
export const defineRuntime = <Facts>(declaration: RuntimeDeclaration<Facts>): RuntimeDeclaration<Facts> => declaration;

/** An adapter value, unchanged; written through this so its port, id and facts are checked together. */
export const defineAdapter = <P extends PortName, Facts = unknown, Impl extends RuntimePorts[P] = RuntimePorts[P]>(
    adapter: Adapter<P, Impl, Facts>
): Adapter<P, Impl, Facts> => adapter;

const refOf = ({ id, port }: AdapterRef): AdapterRef => ({ id, port });

/** Choosing `adapter` needs `needs` chosen for its port; otherwise `adapter`'s port falls back. */
export const requires = (adapter: AdapterRef, needs: AdapterRef): PortConstraint => ({
    kind: 'requires',
    adapter: refOf(adapter),
    needs: refOf(needs),
});

/** `adapter` and `other` cannot run together; the one a toggle chose falls back. */
export const conflicts = (adapter: AdapterRef, other: AdapterRef): PortConstraint => ({
    kind: 'conflicts',
    adapter: refOf(adapter),
    other: refOf(other),
});
