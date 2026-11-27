import { mkdirSync, readFileSync } from 'node:fs';
import { parseEnv } from 'node:util';

import { createWebEnvAdapter } from '@chatic/config';
import {
    authNode,
    cacheMemory,
    defineRuntime,
    foregroundNode,
    headlessModules,
    hostNode,
    nodeHostFacts,
    startRuntime,
    storageFile,
    transportNode,
} from '@chatic/runtime-node';

import { startConnection } from './connection';
import { nodeDataDirectory } from './profile';

export const USER_AGENT = 'dou-cli/0.0.1';

export interface Booted {
    stop(): Promise<void>;
}

export interface BootOptions {
    profile: string;
    writeLine: (line: string) => void;
    env?: Record<string, string | undefined>;
    sockets?: boolean;
}

export type Boot = (options: BootOptions) => Promise<Booted>;

export const readEnvFile = (path: string): Record<string, string | undefined> => parseEnv(readFileSync(path, 'utf8'));

export const bootNode: Boot = async ({ profile, writeLine, env = process.env, sockets = false }) => {
    const directory = nodeDataDirectory(profile);
    mkdirSync(directory, { recursive: true });
    const values: Record<string, string | undefined> = { VITE_ENV: 'dev', ...env };
    const started = await startRuntime(
        defineRuntime({
            name: 'dou-cli',
            facts: nodeHostFacts({ userAgent: USER_AGENT }),
            modules: headlessModules(),
            ports: {
                storage: { default: storageFile(directory) },
                transport: { default: transportNode() },
                auth: { default: authNode() },
                cache: { default: cacheMemory },
                foreground: { default: foregroundNode },
            },
            host: hostNode({ writeLine }),
            config: { env: createWebEnvAdapter(name => values[name]) },
        })
    );
    const stopConnection = sockets && started.engine ? startConnection(started.engine) : undefined;
    return { stop: async () => stopConnection?.() };
};
