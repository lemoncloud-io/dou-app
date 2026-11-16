// --- Session Owner Types ---
//
// The owner switch: which side holds the session on the phone — the page, as it always has, or the
// shell's own runtime. Shown in the web's debug overlay. A shell for a local or test stage answers it
// always; a production shell from 0.32.0 answers it only while its debug mode is on and refuses it with
// `NOT_ALLOWED` otherwise; an older production shell leaves both requests unregistered (`NOT_FOUND`).
// Either refusal makes the overlay show the switch as not offered.
//
// The owner is settled when the shell's JS starts. A change is recorded and then takes effect by the
// shell starting its JS over, which reloads this page with it.

/** Who holds the session: the page (`web`) or the shell's own runtime (`native`). */
export type SessionOwnerName = 'web' | 'native';

/** [Request] Reads the owner. */
export type FetchSessionOwnerPayload = {
    // Empty object type, reserved for future extension (optional fields, etc.).
};

/** [Response] The owner this run started with, and the one recorded for the next start. */
export type OnFetchSessionOwnerPayload = {
    current: SessionOwnerName;
    next: SessionOwnerName;
};

/**
 * [Request] Records `owner` for the next start and, when it differs from the current owner, starts the
 * shell's JS over at once — this page included.
 */
export type SetSessionOwnerPayload = {
    owner: SessionOwnerName;
};

/** [Response] What was recorded, and whether the shell is now restarting to apply it. */
export type OnSetSessionOwnerPayload = {
    next: SessionOwnerName;
    restarting: boolean;
};
