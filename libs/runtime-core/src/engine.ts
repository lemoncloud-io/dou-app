import { createConnectionController } from './connection/connectionController';
import { createCoreRuntimeConnection } from './connection/runtimeConnection';
import type { RuntimeConnection } from './connection/runtimeConnection';
import type { ConnectionController, ConnectionControllerOptions } from './connection/connectionController';
import { PushRegistration } from './push/pushRegistration';
import type { PushRegistrationOptions } from './push/pushRegistration';
import { CloudCredentialGuard } from './session/cloudCredentialGuard';
import type { CloudCredentialPolicy } from './session/cloudCredentialGuard';
import { RelayCredentialGuard } from './session/relayCredentialGuard';
import type { SessionStalenessPolicy } from './session/relayCredentialGuard';
import { createCoreSessionCommands } from './session/commands';
import type { SessionCommands } from './session/commands';
import { createSessionController } from './session/sessionController';
import { createCoreSessionView } from './session/sessionView';
import type { SessionView } from './session/snapshot';
import type { SessionController, SessionControllerOptions } from './session/sessionController';
import { createCoreRuntimeData } from './data/runtimeData';
import type { RuntimeData } from './data/runtimeData';
import { createCoreRuntimeSync } from './sync/runtimeSync';
import type { RuntimeSync } from './sync/runtimeSync';

export interface CredentialGuard<Policy> {
    check(): Promise<void>;
    start(): () => void;
    setPolicy(policy: Policy): void;
}

export interface PushRegistrar {
    start(): () => void;
    notifyForeground(): void;
}

export interface RuntimeEngine {
    session: SessionView;
    commands: SessionCommands;
    connection: RuntimeConnection;
    sync: RuntimeSync;
    data: RuntimeData;
    sessionController(options: SessionControllerOptions): SessionController;
    connectionController(options: ConnectionControllerOptions): ConnectionController;
    relayCredentialGuard(policy?: SessionStalenessPolicy): CredentialGuard<SessionStalenessPolicy>;
    cloudCredentialGuard(policy?: CloudCredentialPolicy): CredentialGuard<CloudCredentialPolicy>;
    pushRegistration(options: PushRegistrationOptions): PushRegistrar;
}

export const coreEngine: RuntimeEngine = {
    session: createCoreSessionView(),
    commands: createCoreSessionCommands(),
    connection: createCoreRuntimeConnection(),
    sync: createCoreRuntimeSync(),
    data: createCoreRuntimeData(),
    sessionController: options => createSessionController(options),
    connectionController: options => createConnectionController(options),
    relayCredentialGuard: policy => new RelayCredentialGuard(policy),
    cloudCredentialGuard: policy => new CloudCredentialGuard(policy),
    pushRegistration: options => new PushRegistration(options),
};
