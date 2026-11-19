import { HOST_PORT_NAMES } from '../host/ports';
import { engineCore } from './engine';
import { PORT_NAMES } from './types';
import type {
    AdapterOf,
    ChoiceLane,
    HostPortChoices,
    HostPortName,
    PortChoice,
    PortChoiceReader,
    PortChoices,
    PortConstraint,
    PortName,
    RuntimeDeclaration,
    SlotName,
} from './types';

type MutableChoices<Facts> = { [P in PortName]: PortChoice<P, Facts> };

/** What choosing needs of an adapter, whichever slot it fills. */
interface Candidate<Facts> {
    readonly id: string;
    readonly supports?: (facts: Facts) => boolean;
}

/** What choosing needs of a slot's declaration, whichever slot it is. */
interface SlotDeclared<A> {
    readonly default: A;
    readonly alternatives?: readonly A[];
    readonly override?: readonly ChoiceLane[];
}

/** The error a declaration that cannot run on this host is reported with. */
export class RuntimeDeclarationError extends Error {
    readonly code = 'RUNTIME_DECLARATION_INVALID';
}

const supported = <Facts>(adapter: Candidate<Facts>, facts: Facts): boolean => adapter.supports?.(facts) ?? true;

/**
 * Which row a toggle came from. A build value and the empty floor both report `default`; only the
 * build's is a value, so a non-empty `default` is the build.
 */
const laneOf = (origin: string): ChoiceLane => (origin === 'default' ? 'build' : (origin as ChoiceLane));

const defaultChoice = <S extends SlotName, Facts>(
    slot: S,
    declared: SlotDeclared<AdapterOf<S, Facts>>,
    fellBack?: PortChoice<S, Facts>['fellBack']
): PortChoice<S, Facts> => {
    const adapter = declared.default;
    return { port: slot, adapter, id: adapter.id, origin: 'default', ...(fellBack ? { fellBack } : {}) };
};

/**
 * A slot's choice from its toggle alone, before the constraints between ports are checked. The same
 * rules for a runtime port, a host port and the engine.
 */
const chooseSlot = <S extends SlotName, Facts>(
    slot: S,
    declared: SlotDeclared<AdapterOf<S, Facts>>,
    name: string,
    facts: Facts,
    read: PortChoiceReader
): PortChoice<S, Facts> => {
    if (!supported<Facts>(declared.default, facts)) {
        // The default is what every fallback lands on; one this host cannot run leaves nothing to land
        // on, so it is the declaration that is wrong, and it is said before anything is built.
        throw new RuntimeDeclarationError(
            `[runtime] ${name}: the default ${slot} adapter '${declared.default.id}' does not support this host`
        );
    }

    const snapshot = read(`port.${slot}`);
    const requested = typeof snapshot?.value === 'string' ? snapshot.value : '';
    // Empty is config's floor: "use the default the app declared".
    if (!snapshot || requested === '') return defaultChoice(slot, declared);

    const from = laneOf(snapshot.origin);
    const fallBack = (because: string) => defaultChoice(slot, declared, { requested, from, because });

    const candidates = [declared.default, ...(declared.alternatives ?? [])];
    const adapter = candidates.find(candidate => candidate.id === requested);
    if (!adapter) {
        return fallBack(`not one of this runtime's ${slot} adapters (${candidates.map(c => c.id).join(', ')})`);
    }
    if (declared.override && !declared.override.includes(from)) {
        return fallBack(`the ${from} row may not change this port`);
    }
    if (!supported<Facts>(adapter, facts)) return fallBack('not supported on this host');

    return { port: slot, adapter, id: adapter.id, origin: from };
};

const choosePort = <P extends PortName, Facts>(
    port: P,
    declaration: RuntimeDeclaration<Facts, unknown>,
    facts: Facts,
    read: PortChoiceReader
): PortChoice<P, Facts> =>
    chooseSlot<P, Facts>(
        port,
        declaration.ports[port] as unknown as SlotDeclared<AdapterOf<P, Facts>>,
        declaration.name,
        facts,
        read
    );

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
export const resolvePorts = <Facts, Owner = never>(
    declaration: RuntimeDeclaration<Facts, Owner>,
    facts: Facts,
    read: PortChoiceReader
): PortChoices<Facts> => {
    const choices = {} as MutableChoices<Facts>;
    for (const port of PORT_NAMES) {
        (choices as Record<PortName, PortChoice<PortName, Facts>>)[port] = choosePort(
            port,
            declaration as RuntimeDeclaration<Facts, unknown>,
            facts,
            read
        );
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
            (choices as Record<PortName, PortChoice<PortName, Facts>>)[port] = defaultChoice(
                port,
                declaration.ports[port] as unknown as SlotDeclared<AdapterOf<PortName, Facts>>,
                { requested: given.id, from: given.origin as ChoiceLane, because: describe(constraint) }
            );
            repaired = true;
            break;
        }
        if (!repaired) return choices;
    }
};

/**
 * Settles every host port a declaration names, by the same rules as a runtime port. A declaration
 * that names none answers `undefined`: the start then publishes nothing, as an app that never asked
 * the host anything did before host ports joined the declaration.
 */
export const resolveHostPorts = <Facts, Owner = never>(
    declaration: RuntimeDeclaration<Facts, Owner>,
    facts: Facts,
    read: PortChoiceReader
): HostPortChoices<Facts> | undefined => {
    const declared = declaration.host;
    if (!declared) return undefined;
    const choices = {} as { [P in HostPortName]: PortChoice<P, Facts> };
    for (const port of HOST_PORT_NAMES) {
        (choices as Record<HostPortName, PortChoice<HostPortName, Facts>>)[port] = chooseSlot<HostPortName, Facts>(
            port,
            declared[port] as unknown as SlotDeclared<AdapterOf<HostPortName, Facts>>,
            declaration.name,
            facts,
            read
        );
    }
    return choices;
};

/** The engine's choice: the declared slot settled like any port, or `engine.core` when none is declared. */
export const resolveEngine = <Facts, Owner = never>(
    declaration: RuntimeDeclaration<Facts, Owner>,
    facts: Facts,
    read: PortChoiceReader
): PortChoice<'engine', Facts> =>
    chooseSlot<'engine', Facts>(
        'engine',
        (declaration.engine ?? { default: engineCore }) as unknown as SlotDeclared<AdapterOf<'engine', Facts>>,
        declaration.name,
        facts,
        read
    );
