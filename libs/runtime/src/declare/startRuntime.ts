import { config as sharedConfig } from '@chatic/config';
import type { ConfigFacade } from '@chatic/config';
import { logger } from '@chatic/logger';
import { allModules, createRuntime as createCoreRuntime, describeModuleGap, moduleGaps, moduleSetOf } from '../engine';
import type { ModuleNames, RuntimeConfig, RuntimeEngine, RuntimeModules, RuntimePorts } from '../engine';

import { host } from '../api/host/hostPorts';
import { HOST_PORT_NAMES } from '../api/host/ports';
import type { HostPorts } from '../api/host/ports';
import { initAppRuntime } from '../api/init';
import { RuntimeDeclarationError, resolveEngine, resolveHostPorts, resolvePorts } from './resolvePorts';
import { runtimeOf } from './runtimeHandle';
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

const ensureConfig = (
    declaration: Pick<RuntimeDeclaration<unknown>, 'name' | 'config'>,
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

const checkModules = <Facts, Owner, M extends RuntimeModules>(
    declaration: RuntimeDeclaration<Facts, Owner, M>,
    modules: RuntimeModules
): void => {
    const declared = declaration.ports as Partial<Record<PortName, unknown>>;
    const gaps = moduleGaps(
        modules,
        PORT_NAMES.filter(port => declared[port] !== undefined)
    );
    if (gaps.length === 0) return;
    throw new RuntimeDeclarationError(
        `[runtime] ${declaration.name}: the modules do not fit together — ${gaps.map(describeModuleGap).join('; ')}`
    );
};

export const startRuntime = async <Facts, Owner = never, const M extends RuntimeModules = RuntimeModules>(
    declaration: RuntimeDeclaration<Facts, Owner, M>,
    options: StartRuntimeOptions = {}
): Promise<StartedRuntime<Facts, Owner, M>> => {
    const modules: RuntimeModules = declaration.modules ?? allModules();
    checkModules(declaration, modules);
    const moduleSet = moduleSetOf(modules);
    const ports = PORT_NAMES.filter(port => moduleSet.ports.has(port));

    const facts = declaration.facts();
    const config = options.config ?? sharedConfig;
    ensureConfig(declaration, config);

    const read: PortChoiceReader = options.read ?? (key => config.snapshot(key));
    const choices = resolvePorts(declaration, facts, read, ports) as PortChoices<Facts, M>;
    const chosen = choices as unknown as PortChoices<Facts>;
    const hostChoices = resolveHostPorts(declaration, facts, read);
    const engineChoice = resolveEngine(declaration, facts, read);

    const log = options.log ?? logToLogger(declaration.name);
    for (const port of ports) log(formatPortChoice(chosen[port]), chosen[port]);
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
        const storage = await chosen.storage.adapter.create(sessionOwner ? { facts, sessionOwner } : { facts });
        const built = { storage } as RuntimePorts;
        for (const port of ports) {
            if (port === 'storage') continue;
            const create = chosen[port].adapter.create as (
                context: AdapterContext<Exclude<PortName, 'storage'>, Facts>
            ) => RuntimePorts[typeof port] | Promise<RuntimePorts[typeof port]>;
            (built as Record<PortName, unknown>)[port] = await create({ facts, storage });
        }
        return (options.createRuntime ?? createCoreRuntime)({
            ...built,
            ...(declaration.modules ? { modules } : {}),
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
        modules: modules.map(module => module.name) as ModuleNames<M>[],
        runtime: runtimeOf<M>(moduleSet),
        choices,
        ...(hostChoices ? { hostChoices } : {}),
        engineChoice,
        facts,
        ...(outcome.owner !== undefined ? { owner: outcome.owner as Owner } : {}),
    };
};
