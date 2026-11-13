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
import { primeChatRoom } from './sync/primeChatRoom';
import { createCoreRuntimeSync } from './sync/runtimeSync';
import type { RuntimeSync } from './sync/runtimeSync';
import type { ChatPrimeOutcome, PrimeChatRoomOptions } from './sync/primeChatRoom';

/** A credential guard as its caller drives it: a policy, a check, and triggers to start and stop. */
export interface CredentialGuard<Policy> {
    /** Evaluates once, now. Works whether or not the guard is started. */
    check(): Promise<void>;
    /** Arms the triggers the policy asks for; returns their stop. */
    start(): () => void;
    /** Replaces the policy. The next evaluation reads it; triggers are re-armed by the next `start`. */
    setPolicy(policy: Policy): void;
}

/** Push device-token registration as its caller drives it. */
export interface PushRegistrar {
    /** Registers now if signed in, then on each sign-in, foreground return and token rotation. */
    start(): () => void;
    /** The app may be back in front of the user — for a signal the foreground port does not carry. */
    notifyForeground(): void;
}

/**
 * The runtime as the React surface sees its lifecycle work: everything a host or a hook starts and
 * stops, made by the engine rather than by the surface itself.
 *
 * An engine is what an entry point builds and hands to `initAppRuntime(engine)`. The one there is today
 * is the core engine, which `createRuntime` returns after wiring the core packages — the runtime runs in
 * this process. A runtime that runs elsewhere (the native process, with the page mirroring it) supplies
 * the same members backed by that process; the surface does not know which it was given.
 *
 * The session is in it — its state (`session`, without tokens) and everything a screen does to it
 * (`commands`) — and so are the sockets (`connection`) and the sync engine (`sync`). Not in it yet: the
 * repositories, which still come straight from the core packages.
 */
export interface RuntimeEngine {
    /** The session as screens read it — a snapshot without tokens, and its changes. */
    session: SessionView;
    /** What a screen does to the session — signing in and out, switching, a pairing's steps. */
    commands: SessionCommands;
    /** The sockets as screens read and drive them: their state, waits, pushes and recovery. */
    connection: RuntimeConnection;
    /** The sync engine as screens drive it: the targets kept in sync, and the cache's baselines. */
    sync: RuntimeSync;
    /** The relay session's boot and the guest keep-alive. */
    sessionController(options: SessionControllerOptions): SessionController;
    /** The sockets kept in line with the session, and the background clouds. */
    connectionController(options: ConnectionControllerOptions): ConnectionController;
    /** Keeps the relay's HTTP signing credential fresh. */
    relayCredentialGuard(policy?: SessionStalenessPolicy): CredentialGuard<SessionStalenessPolicy>;
    /** Keeps every cloud's socket session from lapsing. */
    cloudCredentialGuard(policy?: CloudCredentialPolicy): CredentialGuard<CloudCredentialPolicy>;
    /** Registers the shell's push token, once per install. */
    pushRegistration(options: PushRegistrationOptions): PushRegistrar;
    /** Primes a chat room for its first render. */
    primeChatRoom(cid: string, channelId: string, options?: PrimeChatRoomOptions): Promise<ChatPrimeOutcome>;
}

/**
 * The core engine: each member makes the core implementation, in this process. Its one piece of
 * state is the session view's cache of the last snapshot; the session itself lives in the core
 * packages `createRuntime` wired, and the rest in what each call makes.
 */
export const coreEngine: RuntimeEngine = {
    session: createCoreSessionView(),
    commands: createCoreSessionCommands(),
    connection: createCoreRuntimeConnection(),
    sync: createCoreRuntimeSync(),
    sessionController: options => createSessionController(options),
    connectionController: options => createConnectionController(options),
    relayCredentialGuard: policy => new RelayCredentialGuard(policy),
    cloudCredentialGuard: policy => new CloudCredentialGuard(policy),
    pushRegistration: options => new PushRegistration(options),
    primeChatRoom: (cid, channelId, options) => primeChatRoom(cid, channelId, options),
};
