import { config as sharedConfig } from '@chatic/config';
import type { ConfigFacade } from '@chatic/config';
import { logger } from '@chatic/logger';
import { createRuntime as createCoreRuntime } from '@chatic/runtime-core';
import type { RuntimeConfig, RuntimeEngine, RuntimePorts } from '@chatic/runtime-core';

import { initAppRuntime } from '../init';
import { RuntimeDeclarationError, resolvePorts } from './resolvePorts';
import { PORT_NAMES } from './types';
import type {
    AdapterContext,
    PortChoiceReader,
    PortChoiceSummary,
    PortChoices,
    PortName,
    RuntimeDeclaration,
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
const ensureConfig = <Facts>(declaration: RuntimeDeclaration<Facts>, config: RuntimeConfigAccess): void => {
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
 * 3. settles every port (`resolvePorts`) and logs one line per port;
 * 4. builds the ports, `storage` first, waiting for any adapter that loads;
 * 5. assembles the runtime (`createRuntime`) and hands its engine to the React surface.
 *
 * The lines are logged before anything is built, so a port that fails to build is reported against the
 * adapter it was meant to be.
 */
export const startRuntime = async <Facts>(
    declaration: RuntimeDeclaration<Facts>,
    options: StartRuntimeOptions = {}
): Promise<StartedRuntime<Facts>> => {
    const facts = declaration.facts();
    const config = options.config ?? sharedConfig;
    ensureConfig(declaration, config);

    const read: PortChoiceReader = options.read ?? (key => config.snapshot(key));
    const choices: PortChoices<Facts> = resolvePorts(declaration, facts, read);

    const log = options.log ?? logToLogger(declaration.name);
    for (const port of PORT_NAMES) log(formatPortChoice(choices[port]), choices[port]);

    const storage = await choices.storage.adapter.create({ facts });
    const built = { storage } as RuntimePorts;
    for (const port of PORT_NAMES) {
        if (port === 'storage') continue;
        const create = choices[port].adapter.create as (
            context: AdapterContext<Exclude<PortName, 'storage'>, Facts>
        ) => RuntimePorts[typeof port] | Promise<RuntimePorts[typeof port]>;
        (built as Record<PortName, unknown>)[port] = await create({ facts, storage });
    }

    const engine = (options.createRuntime ?? createCoreRuntime)({
        ...built,
        signedOutKeyPrefixes: declaration.signedOutKeyPrefixes,
        data: declaration.data,
    });
    (options.initEngine ?? initAppRuntime)(engine);
    return { engine, choices, facts };
};
