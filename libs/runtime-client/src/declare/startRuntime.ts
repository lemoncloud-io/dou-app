import { config as sharedConfig } from '@chatic/config';
import type { ConfigFacade } from '@chatic/config';
import { logger } from '@chatic/logger';
import { createRuntime as createCoreRuntime } from '@chatic/runtime-core';
import type { RuntimeConfig, RuntimeEngine, RuntimePorts } from '@chatic/runtime-core';

import { host } from '../host/hostPorts';
import { HOST_PORT_NAMES } from '../host/ports';
import type { HostPorts } from '../host/ports';
import { initAppRuntime } from '../init';
import { RuntimeDeclarationError, resolveEngine, resolveHostPorts, resolvePorts } from './resolvePorts';
import { PORT_NAMES } from './types';
import type {
    AdapterContext,
    EngineContext,
    HostAdapter,
    HostPortName,
    PortChoiceReader,
    PortChoiceSummary,
    PortChoices,
    PortName,
    RuntimeDeclaration,
    SessionOwnerSide,
    StartedRuntime,
} from './types';

/** The part of `@chatic/config`'s facade the start uses. */
export type RuntimeConfigAccess = Pick<ConfigFacade, 'init' | 'isInitialized' | 'snapshot'>;

/** What a test, or an unusual entry point, swaps out. Production leaves every field out. */
export interface StartRuntimeOptions {
    /** The config the toggles are read from and initialised in; `@chatic/config`'s `config` by default. */
    config?: RuntimeConfigAccess;
    /** Reads a port's toggle; `config.snapshot` by default. */
    read?: PortChoiceReader;
    /** Assembles the runtime from the built ports; runtime-core's `createRuntime` by default. */
    createRuntime?: (config: RuntimeConfig) => RuntimeEngine;
    /** Hands the engine to the React surface; `initAppRuntime` by default. */
    initEngine?: (engine: RuntimeEngine) => void;
    /** Publishes the host ports the declaration names; the process's `host.publish` by default. */
    publishHost?: (ports: HostPorts) => void;
    /** Where each port's line goes; `logger.info` by default. */
    log?: (line: string, choice: PortChoiceSummary) => void;
}

/** The tag the port lines are logged under. */
export const RUNTIME_PORT_LOG_TAG = 'app.runtime_port';

/** One port's line: `port → adapter id (origin[, fell back: reason])`. */
export const formatPortChoice = (choice: PortChoiceSummary): string => {
    const fellBack = choice.fellBack
        ? `, fell back: ${choice.fellBack.from} asked for '${choice.fellBack.requested}', ${choice.fellBack.because}`
        : '';
    return `${choice.port} → ${choice.id} (${choice.origin}${fellBack})`;
};

const logToLogger =
    (name: string) =>
    (line: string, choice: PortChoiceSummary): void =>
        logger.info(RUNTIME_PORT_LOG_TAG, `[${name}] ${line}`, {
            data: {
                runtime: name,
                port: choice.port,
                id: choice.id,
                origin: choice.origin,
                ...(choice.fellBack ? { fellBack: choice.fellBack } : {}),
            },
        });

/**
 * Config is the app's to initialise, once. A declaration that carries config's ports asks for it to be
 * done here; one that does not expects the entry point to have done it. Either way it is never done
 * twice — a second `init` would drop the lanes already read.
 */
const ensureConfig = <Facts, Owner>(
    declaration: RuntimeDeclaration<Facts, Owner>,
    config: RuntimeConfigAccess
): void => {
    const initialised = config.isInitialized();
    if (declaration.config) {
        if (initialised) {
            logger.warn(
                'config.runtime_init_skipped',
                `[startRuntime] ${declaration.name}: config was initialised before the runtime started; the declaration's config ports are not used`
            );
            return;
        }
        config.init(declaration.config);
        return;
    }
    if (!initialised) {
        throw new RuntimeDeclarationError(
            `[runtime] ${declaration.name}: config is not initialised — call config.init(ports) before startRuntime, or name the ports in the declaration's \`config\``
        );
    }
};

/**
 * Starts the runtime an app declared, once, from its entry point and before render:
 *
 * 1. reads the host facts;
 * 2. makes sure config is initialised (the toggles live there);
 * 3. settles every runtime port (`resolvePorts`), every host port the declaration names
 *    (`resolveHostPorts`) and the engine (`resolveEngine`), and logs one line for each;
 * 4. builds the host ports and publishes them through the host holder, so they are readable before
 *    anything below runs — the order the entry points kept by publishing before the boot;
 * 5. runs the engine adapter, which builds the runtime ports (`storage` first, waiting for any adapter
 *    that loads) and the core engine over them — or, for an engine that mirrors one elsewhere, none of
 *    them;
 * 6. hands the engine, if one was built, to the React surface.
 *
 * The lines are logged before anything is built, so a port that fails to build is reported against the
 * adapter it was meant to be.
 */
export const startRuntime = async <Facts, Owner = never>(
    declaration: RuntimeDeclaration<Facts, Owner>,
    options: StartRuntimeOptions = {}
): Promise<StartedRuntime<Facts, Owner>> => {
    const facts = declaration.facts();
    const config = options.config ?? sharedConfig;
    ensureConfig(declaration, config);

    const read: PortChoiceReader = options.read ?? (key => config.snapshot(key));
    const choices: PortChoices<Facts> = resolvePorts(declaration, facts, read);
    const hostChoices = resolveHostPorts(declaration, facts, read);
    const engineChoice = resolveEngine(declaration, facts, read);

    const log = options.log ?? logToLogger(declaration.name);
    for (const port of PORT_NAMES) log(formatPortChoice(choices[port]), choices[port]);
    log(formatPortChoice(engineChoice), engineChoice);
    if (hostChoices) for (const port of HOST_PORT_NAMES) log(formatPortChoice(hostChoices[port]), hostChoices[port]);

    if (hostChoices) {
        const ports = {} as Record<HostPortName, HostPorts[HostPortName]>;
        for (const port of HOST_PORT_NAMES) {
            const create = hostChoices[port].adapter.create as HostAdapter<
                HostPortName,
                HostPorts[HostPortName],
                Facts
            >['create'];
            ports[port] = create({ facts });
        }
        (options.publishHost ?? (value => host.publish(value)))(ports as HostPorts);
    }

    const buildCore = async (sessionOwner?: SessionOwnerSide): Promise<RuntimeEngine> => {
        const storage = await choices.storage.adapter.create(sessionOwner ? { facts, sessionOwner } : { facts });
        const built = { storage } as RuntimePorts;
        for (const port of PORT_NAMES) {
            if (port === 'storage') continue;
            const create = choices[port].adapter.create as (
                context: AdapterContext<Exclude<PortName, 'storage'>, Facts>
            ) => RuntimePorts[typeof port] | Promise<RuntimePorts[typeof port]>;
            (built as Record<PortName, unknown>)[port] = await create({ facts, storage });
        }
        return (options.createRuntime ?? createCoreRuntime)({
            ...built,
            signedOutKeyPrefixes: declaration.signedOutKeyPrefixes,
            data: declaration.data,
        });
    };
    // One set of ports per start, however often the engine asks: a second set would open a second
    // session over the same stores.
    let coreEngine: Promise<RuntimeEngine> | null = null;
    const context: EngineContext<Facts> = {
        facts,
        core: ({ sessionOwner } = {}) => (coreEngine ??= buildCore(sessionOwner)),
    };

    const outcome = await engineChoice.adapter.create(context);
    if (outcome.engine) (options.initEngine ?? initAppRuntime)(outcome.engine);
    return {
        engine: outcome.engine,
        choices,
        ...(hostChoices ? { hostChoices } : {}),
        engineChoice,
        facts,
        ...(outcome.owner !== undefined ? { owner: outcome.owner as Owner } : {}),
    };
};
