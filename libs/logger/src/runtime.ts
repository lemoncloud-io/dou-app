import { CoreLogger } from './core/CoreLogger';
import { LogHub } from './core/LogHub';

import type { LogContextProvider, LogEntry, Logger } from './core/types';

const hub = new LogHub();
const core = new CoreLogger({ hub });

export const logHub: LogHub = hub;

export const logger: Logger = core;

export const setLogContextProvider = (provider: LogContextProvider | undefined): void =>
    core.setContextProvider(provider);

export const ingestLogEntry = (entry: LogEntry): void => core.ingest(entry);
