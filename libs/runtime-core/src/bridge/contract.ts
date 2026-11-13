import type {
    OnRuntimeHelloPayload,
    RuntimeHelloPayload,
    RuntimeOffer,
    RuntimeWireValue,
} from '@chatic/bridge-messages';

import type { RuntimeConnection } from '../connection/runtimeConnection';
import type { SessionCommands } from '../session/commands';
import type { RuntimeSync } from '../sync/runtimeSync';
import type { SessionSnapshot } from '../session/snapshot';

/**
 * The runtime contract this build speaks across the bridge: what the session snapshot holds, which
 * methods a `RuntimeCall` may name and what their arguments and results are, which events a
 * subscription carries. It is one number for all of it, raised when any of it changes in a way the
 * other side cannot read — a field removed or renamed, a method's arguments reshaped. Adding a
 * method or an optional field does not raise it: a shell whose runtime predates a method answers a
 * call to it with `RUNTIME_NOT_AVAILABLE` (see `errors.ts`), which the page reads as "not in this app
 * yet" and falls back on, as it does for a bridge message an older shell does not answer.
 *
 * Both halves are this package's code, but they ship separately: the page with every web deploy, the
 * shell's runtime with an app release. A page newer than the installed app is the normal case, so
 * each side says every version it can still speak and the handshake takes the newest they share.
 */
export const RUNTIME_CONTRACT_VERSION = 1;

/** Every contract version this build can speak, lowest first. */
export const RUNTIME_CONTRACTS: readonly number[] = [RUNTIME_CONTRACT_VERSION];

const isContractList = (value: unknown): value is number[] =>
    Array.isArray(value) && value.every(entry => Number.isInteger(entry) && entry > 0);

/** The newest contract version in both lists, or `null` when they share none. */
export const chooseRuntimeContract = (page: readonly number[], shell: readonly number[]): number | null => {
    const shared = page.filter(version => shell.includes(version));
    return shared.length > 0 ? Math.max(...shared) : null;
};

/**
 * The shell's offer to own the session, read from the value it injected before the page ran
 * (`window.CHATIC_APP_RUNTIME`), or `null` when there is none worth a handshake: no value, a value
 * that is not an offer, or an offer in none of `contracts`. The injected value is read as untrusted —
 * a page reloaded into an older shell, or a shell build with a typo, must fall back to the page owning
 * the session, not throw at boot.
 */
export const readRuntimeOffer = (
    value: unknown,
    contracts: readonly number[] = RUNTIME_CONTRACTS
): RuntimeOffer | null => {
    if (typeof value !== 'object' || value === null) return null;
    try {
        const offer = value as Partial<RuntimeOffer>;
        if (offer.sessionOwner !== 'native' || !isContractList(offer.contracts)) return null;
        if (chooseRuntimeContract(contracts, offer.contracts) === null) return null;
        return { sessionOwner: 'native', contracts: [...offer.contracts] };
    } catch {
        // A getter on the injected value that throws is no offer either.
        return null;
    }
};

/** The session as the shell hands it to a page: its sequence number and the snapshot, without tokens. */
export interface SessionSnapshotWire {
    seq: number;
    session: SessionSnapshot;
}

/** The `target` a `RuntimeCall` names for a session command. */
export const SESSION_COMMANDS_TARGET = 'session';

// Keyed by every command, so a command added to `SessionCommands` and left out here does not compile.
const sessionCommandMethods: Record<keyof SessionCommands, true> = {
    loginUser: true,
    loginBySocialToken: true,
    loginGuestByDevice: true,
    loginByOAuthCode: true,
    confirmPhoneLogin: true,
    retryPhoneLogin: true,
    cancelPhoneLogin: true,
    loginWithInviteCode: true,
    forgetInviteLogin: true,
    switchCloud: true,
    switchSite: true,
    clearSiteSelection: true,
    logout: true,
    logoutCloud: true,
    patchRelayUser: true,
    claimPairing: true,
    applyPairingSession: true,
    preparePairedCloudEntry: true,
    checkPairedClouds: true,
    endPairedCloud: true,
};

/**
 * The session commands a `RuntimeCall` to `SESSION_COMMANDS_TARGET` may name — the allow-list the shell
 * dispatches against. The arguments are the command's own, in order; the answer is what it resolves with.
 */
export const SESSION_COMMAND_METHODS = Object.keys(sessionCommandMethods) as readonly (keyof SessionCommands)[];

/**
 * How a member of a target crosses: `view` is mirrored with the snapshot it reads, `call` is one
 * `RuntimeCall`, `stream` is a `RuntimeSubscribe` whose events the page hears until it unsubscribes.
 * `local` does not cross at all: what crosses is a domain result, never a raw socket request or frame,
 * so such a member works only where the runtime runs in the page's own process.
 */
type Crossing = 'view' | 'call' | 'stream' | 'local';

const membersCrossing = <T>(members: Record<keyof T, Crossing>, crossing: Crossing): readonly (keyof T)[] =>
    (Object.keys(members) as (keyof T)[]).filter(member => members[member] === crossing);

/** The `target` a `RuntimeCall` or `RuntimeSubscribe` names for the sockets. */
export const CONNECTION_TARGET = 'connection';

// Keyed by every member, so one added to `RuntimeConnection` and left out here does not compile.
const connectionMembers: Record<keyof RuntimeConnection, Crossing> = {
    snapshot: 'view',
    subscribe: 'view',
    waitUntilVerified: 'call',
    // A raw request of any type, and every frame: neither is a domain result. The relay account's
    // profile reads and writes, the one use of the request in a page that may be mirrored, become
    // domain calls before the page mirrors a runtime in another process; the frames feed a desktop
    // debug log, and the desktop shell never runs the runtime itself.
    requestOnSlot: 'local',
    onServerEvent: 'stream',
    onServerMessage: 'local',
    observeRequests: 'stream',
    slotStatuses: 'call',
    reconnect: 'call',
    recoverUnverified: 'call',
    recoverOnResume: 'call',
    setBackgroundClouds: 'call',
    setOwnedClouds: 'call',
};

/** The connection methods a `RuntimeCall` may name. */
export const CONNECTION_CALL_METHODS = membersCrossing<RuntimeConnection>(connectionMembers, 'call');
/** The connection streams a `RuntimeSubscribe` may name: a server push type, request samples. */
export const CONNECTION_STREAMS = membersCrossing<RuntimeConnection>(connectionMembers, 'stream');
/** The connection members that never cross: they work only with the runtime in the page's process. */
export const CONNECTION_LOCAL_MEMBERS = membersCrossing<RuntimeConnection>(connectionMembers, 'local');

/** The `target` a `RuntimeCall` or `RuntimeSubscribe` names for the sync engine. */
export const SYNC_TARGET = 'sync';

const syncMembers: Record<keyof RuntimeSync, Crossing> = {
    registerTarget: 'stream',
    updateLocalSnapshot: 'call',
    listTargets: 'call',
};

/** The sync methods a `RuntimeCall` may name. */
export const SYNC_CALL_METHODS = membersCrossing<RuntimeSync>(syncMembers, 'call');
/** The sync streams a `RuntimeSubscribe` may name: a registration stands while its stream is open. */
export const SYNC_STREAMS = membersCrossing<RuntimeSync>(syncMembers, 'stream');

/** What the shell knows when a page says hello. */
export interface RuntimeHelloHost {
    /** The contract versions the shell's runtime speaks. */
    contracts: readonly number[];
    /**
     * Whether the shell runs its runtime this launch. A shell that offered can still decline — but once
     * it has answered a hello with `native`, this stays `true` until the app process ends: a page that
     * asks again (a reload, or a retry after its first ask went unanswered) must hear the same owner.
     */
    owns: boolean;
    /** The session as it is now. Read only when the shell takes the session. */
    session(): SessionSnapshotWire;
}

/**
 * The shell's answer to a page's hello: the session is the shell's, under the newest contract both
 * speak, with the session as it is now — or the page's own, when the shell does not run its runtime
 * this launch or shares no contract with the page.
 */
export const answerRuntimeHello = (request: RuntimeHelloPayload, host: RuntimeHelloHost): OnRuntimeHelloPayload => {
    const contract = isContractList(request?.contracts)
        ? chooseRuntimeContract(request.contracts, host.contracts)
        : null;
    if (!host.owns || contract === null) return { sessionOwner: 'web' };
    const { seq, session } = host.session();
    // A snapshot is plain JSON by construction (`session/snapshot.ts`); the bridge declares its bodies
    // as JSON values, which an interface without an index signature does not satisfy as a type.
    return { sessionOwner: 'native', contract, seq, session: session as unknown as RuntimeWireValue };
};

/** What came back for the page's hello: the shell's answer, or the bridge's failure code. */
export type RuntimeHelloOutcome = { answer: OnRuntimeHelloPayload } | { failure: { code: string } };

/**
 * How the page runs this launch: on its own runtime (`web`), mirroring the shell's (`native`), or not
 * settled yet (`null`) — the page has to ask again before it boots either.
 */
export type RuntimeSettlement =
    | { sessionOwner: 'web' }
    | Extract<OnRuntimeHelloPayload, { sessionOwner: 'native' }>
    | { sessionOwner: null };

/**
 * Reads what came back for the page's hello.
 *
 * The page may run its own runtime only when it knows the shell does not: the shell said `web`, or it
 * answered `NOT_FOUND` — a shell with no handler for the hello has no runtime to own the session with.
 * Anything else that is not a complete `native` answer under one of the page's own `contracts` — a
 * timeout, another failure, an answer that does not read — settles nothing. The shell may already have
 * taken the session when its answer was lost, and a page that booted its own runtime then would be a
 * second owner (or one that finds no session, which the shell keeps from it). So the page asks again;
 * the shell answers every hello of a launch with the same owner, which makes asking again safe.
 */
export const settleRuntimeHello = (
    outcome: RuntimeHelloOutcome,
    contracts: readonly number[] = RUNTIME_CONTRACTS
): RuntimeSettlement => {
    if ('failure' in outcome) {
        return outcome.failure?.code === 'NOT_FOUND' ? { sessionOwner: 'web' } : { sessionOwner: null };
    }
    // Read as untrusted: the wire value may not be the shape its type says.
    const answer: Record<string, unknown> = (outcome.answer as Record<string, unknown> | null | undefined) ?? {};
    const owner = answer.sessionOwner;
    if (owner === 'web') return { sessionOwner: 'web' };
    if (owner !== 'native') return { sessionOwner: null };
    const { contract, seq, session } = answer;
    if (typeof contract !== 'number' || !contracts.includes(contract)) return { sessionOwner: null };
    if (typeof seq !== 'number' || !Number.isInteger(seq) || session === undefined) return { sessionOwner: null };
    return { sessionOwner: 'native', contract, seq, session: session as RuntimeWireValue };
};
