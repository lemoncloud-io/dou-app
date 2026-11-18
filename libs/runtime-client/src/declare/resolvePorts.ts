import type { RuntimePorts } from '@chatic/runtime-core';

import { PORT_NAMES } from './types';
import type {
    Adapter,
    ChoiceLane,
    PortChoice,
    PortChoiceReader,
    PortChoices,
    PortConstraint,
    PortName,
    RuntimeDeclaration,
} from './types';

type AnyAdapter<Facts> = Adapter<PortName, RuntimePorts[PortName], Facts>;
type MutableChoices<Facts> = { [P in PortName]: PortChoice<P, Facts> };

/** The error a declaration that cannot run on this host is reported with. */
export class RuntimeDeclarationError extends Error {
    readonly code = 'RUNTIME_DECLARATION_INVALID';
}

const supported = <Facts>(adapter: AnyAdapter<Facts>, facts: Facts): boolean => adapter.supports?.(facts) ?? true;

/**
 * Which row a toggle came from. A build value and the empty floor both report `default`; only the
 * build's is a value, so a non-empty `default` is the build.
 */
const laneOf = (origin: string): ChoiceLane => (origin === 'default' ? 'build' : (origin as ChoiceLane));

const defaultChoice = <P extends PortName, Facts>(
    port: P,
    declaration: RuntimeDeclaration<Facts>,
    fellBack?: PortChoice<P, Facts>['fellBack']
): PortChoice<P, Facts> => {
    const adapter = declaration.ports[port].default as Adapter<P, RuntimePorts[P], Facts>;
    return { port, adapter, id: adapter.id, origin: 'default', ...(fellBack ? { fellBack } : {}) };
};

/** A port's choice from its toggle alone, before the constraints between ports are checked. */
const choosePort = <P extends PortName, Facts>(
    port: P,
    declaration: RuntimeDeclaration<Facts>,
    facts: Facts,
    read: PortChoiceReader
): PortChoice<P, Facts> => {
    const declared = declaration.ports[port];
    if (!supported(declared.default, facts)) {
        // The default is what every fallback lands on; one this host cannot run leaves nothing to land
        // on, so it is the declaration that is wrong, and it is said before anything is built.
        throw new RuntimeDeclarationError(
            `[runtime] ${declaration.name}: the default ${port} adapter '${declared.default.id}' does not support this host`
        );
    }

    const snapshot = read(`port.${port}`);
    const requested = typeof snapshot?.value === 'string' ? snapshot.value : '';
    // Empty is config's floor: "use the default the app declared".
    if (!snapshot || requested === '') return defaultChoice(port, declaration);

    const from = laneOf(snapshot.origin);
    const fallBack = (because: string) => defaultChoice(port, declaration, { requested, from, because });

    const candidates = [declared.default, ...(declared.alternatives ?? [])];
    const adapter = candidates.find(candidate => candidate.id === requested);
    if (!adapter) {
        return fallBack(`not one of this runtime's ${port} adapters (${candidates.map(c => c.id).join(', ')})`);
    }
    if (declared.override && !declared.override.includes(from)) {
        return fallBack(`the ${from} row may not change this port`);
    }
    if (!supported(adapter, facts)) return fallBack('not supported on this host');

    return { port, adapter: adapter as Adapter<P, RuntimePorts[P], Facts>, id: adapter.id, origin: from };
};

const isChosen = <Facts>(choices: PortChoices<Facts>, ref: { id: string; port: PortName }): boolean =>
    choices[ref.port].id === ref.id;

/** The ports a broken constraint involves, the one to give up first leading. */
const brokenBy = <Facts>(choices: PortChoices<Facts>, constraint: PortConstraint): PortName[] | null => {
    switch (constraint.kind) {
        case 'requires':
            return isChosen(choices, constraint.adapter) && !isChosen(choices, constraint.needs)
                ? [constraint.adapter.port, constraint.needs.port]
                : null;
        case 'conflicts':
            return isChosen(choices, constraint.adapter) && isChosen(choices, constraint.other)
                ? [constraint.adapter.port, constraint.other.port]
                : null;
    }
};

const describe = (constraint: PortConstraint): string =>
    constraint.kind === 'requires'
        ? `'${constraint.adapter.id}' requires '${constraint.needs.id}'`
        : `'${constraint.adapter.id}' conflicts with '${constraint.other.id}'`;

/**
 * Settles every port of a declaration on this host. Pure: the facts and the toggles are handed in.
 *
 * Each port, in order:
 *
 * 1. The default must support the host, or the declaration is wrong and this throws.
 * 2. No toggle, or an empty one → the default.
 * 3. The toggle's id must be the default or one of the declared alternatives, its row must be one
 *    the port's `override` allows, and the adapter must support the host; any of these failing → the
 *    default, with the reason kept on the choice.
 *
 * Then the constraints: while one is broken, the port a toggle moved off its default that the
 * constraint involves goes back to its default (the dependent side first). A constraint broken by
 * defaults alone cannot be repaired by falling back, so that throws too.
 */
export const resolvePorts = <Facts>(
    declaration: RuntimeDeclaration<Facts>,
    facts: Facts,
    read: PortChoiceReader
): PortChoices<Facts> => {
    const choices = {} as MutableChoices<Facts>;
    for (const port of PORT_NAMES) {
        (choices as Record<PortName, PortChoice<PortName, Facts>>)[port] = choosePort(port, declaration, facts, read);
    }

    const constraints = declaration.constraints ?? [];
    // Each round moves one port back to its default, so this ends within one round per port.
    for (;;) {
        let repaired = false;
        for (const constraint of constraints) {
            const ports = brokenBy(choices, constraint);
            if (!ports) continue;
            const port = ports.find(p => choices[p].adapter !== declaration.ports[p].default);
            if (!port) {
                throw new RuntimeDeclarationError(
                    `[runtime] ${declaration.name}: the default adapters break a constraint — ${describe(constraint)}`
                );
            }
            const given = choices[port];
            // A port off its default got there from a toggle, whose row `choosePort` already named
            // (`laneOf`), so its origin is a lane and never `default`.
            (choices as Record<PortName, PortChoice<PortName, Facts>>)[port] = defaultChoice(port, declaration, {
                requested: given.id,
                from: given.origin as ChoiceLane,
                because: describe(constraint),
            });
            repaired = true;
            break;
        }
        if (!repaired) return choices;
    }
};
