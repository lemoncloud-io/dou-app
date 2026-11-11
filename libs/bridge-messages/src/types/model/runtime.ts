// --- Runtime Types ---
//
// The runtime across the bridge. On the phone the session can belong to the shell's own process: the
// shell runs the runtime (the session, its tokens, the sockets, sync and the repositories) and the
// main web mirrors it, asking the shell for everything the session decides. These messages are that
// conversation, and there are only these: a call, a subscription, a session push and a handshake.
// What is called is named in the payload rather than in the message type, so the web can call
// something new without a new message — the shell answers it once its own runtime has it.
//
// The bodies are plain JSON. What they mean — the session snapshot, the methods a call may name, the
// events a subscription carries, the contract version — is the runtime's contract, declared by
// `@chatic/runtime-core`, not here: this vocabulary only says how it travels.
//
// No token crosses. The snapshot leaves the tokens out, and a call answers with what the screen needs,
// never a credential.
//
// Only the main web is answered — a sub WebView page or another origin gets nothing — and only by a
// shell that offered to own the session. The offer is made before the page runs, in
// `window.CHATIC_APP_RUNTIME`, so a page asks only a shell that can answer; the handshake below is
// where the two settle it for this launch.

/** A JSON value as it crosses the bridge. */
export type RuntimeWireValue =
    | null
    | boolean
    | number
    | string
    | RuntimeWireValue[]
    | { [key: string]: RuntimeWireValue };

/**
 * What a shell that can own the session says before the page runs, in `window.CHATIC_APP_RUNTIME`.
 * Only an offer: the handshake settles it.
 */
export type RuntimeOffer = {
    sessionOwner: 'native';
    /** The runtime contract versions the shell's runtime speaks, lowest first. */
    contracts: number[];
};

/**
 * [Request] Opens the runtime conversation for this page load. Sent once, before the page boots its
 * runtime; a reloaded page sends it again and gets the session as it is now.
 */
export type RuntimeHelloPayload = {
    /** The runtime contract versions the page speaks, lowest first. */
    contracts: number[];
};

/**
 * [Response] Who owns the session for this launch. `native` with the contract both sides chose and the
 * current session; `web` when the shell declines — it speaks none of the page's contracts, or it will
 * not run its runtime this launch — and the page runs its own. The shell gives the same owner to every
 * hello of a launch.
 */
export type OnRuntimeHelloPayload =
    | { sessionOwner: 'web' }
    | {
          sessionOwner: 'native';
          /** The contract version this conversation uses. */
          contract: number;
          /** The session snapshot's sequence number. */
          seq: number;
          /** The session snapshot, without tokens. */
          session: RuntimeWireValue;
      };

/** [Request] Calls one method of the shell's runtime. */
export type RuntimeCallPayload = {
    /** What owns the method — a part of the session, a repository (named by the runtime's contract). */
    target: string;
    method: string;
    args: RuntimeWireValue[];
};

/**
 * [Response] What the method returned. A method that throws answers `success: false`; the error's
 * `details` carry what the page needs to throw the same kind of error.
 */
export type OnRuntimeCallPayload = {
    value: RuntimeWireValue;
};

/** [Request] Starts a stream of events — a chat feed, a channel list — under an id the page chose. */
export type RuntimeSubscribePayload = {
    subscriptionId: string;
    target: string;
    topic: string;
    args: RuntimeWireValue[];
};

/** [Response] The subscription is open; its events follow as `OnRuntimeEvent`. */
export type OnRuntimeSubscribePayload = Record<string, never>;

/** [Request] Ends a stream the page opened. Ending one that is already gone is not an error. */
export type RuntimeUnsubscribePayload = {
    subscriptionId: string;
};

/** [Response] The subscription is closed; no event for it follows. */
export type OnRuntimeUnsubscribePayload = Record<string, never>;

/**
 * [Push] One event of an open subscription. `seq` counts up per subscription, so the page can tell a
 * gap from a late arrival.
 */
export type OnRuntimeEventPayload = {
    subscriptionId: string;
    seq: number;
    event: RuntimeWireValue;
};

/**
 * [Push] The session changed. `seq` counts up for the launch; a page that already has a later snapshot
 * drops this one.
 */
export type OnRuntimeSessionChangedPayload = {
    seq: number;
    /** What kinds of change this snapshot carries, as the runtime's contract names them. */
    signals: string[];
    session: RuntimeWireValue;
};
