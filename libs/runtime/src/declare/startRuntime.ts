import { config as sharedConfig } from '@chatic/config';
import type { ConfigFacade } from '@chatic/config';
import { logger } from '@chatic/logger';
import { createRuntime as createCoreRuntime } from '../engine';
import type { RuntimeConfig, RuntimeEngine, RuntimePorts } from '../engine';

import { host } from '../api/host/hostPorts';
import { HOST_PORT_NAMES } from '../api/host/ports';
import type { HostPorts } from '../api/host/ports';
import { initAppRuntime } from '../api/init';
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

export type RuntimeConfigAccess = Pick<ConfigFacade, 'init' | 'isInitialized' | 'snapshot'>;

export interface StartRuntimeOptions {
    config?: RuntimeConfigAccess;
    read?: PortChoiceReader;
    createRuntime?: (config: RuntimeConfig) => RuntimeEngine;
    initEngine?: (engine: RuntimeEngine) => void;
    publishHost?: (ports: HostPorts) => void;
    log?: (line: string, choice: PortChoiceSummary) => void;
}

export const RUNTIME_PORT_LOG_TAG = 'app.runtime_port';

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
