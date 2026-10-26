// --- Share Intake Types ---
//
// What another app shared to Dou through the OS share sheet. The OS hands the items to the shell, never
// to the web: the iOS Share Extension and the Android `ACTION_SEND` intent copy them into the shell's own
// `attach-pick` folder and open the app on `<scheme>://share?id=<id>`, which the deep-link pipeline turns
// into `OnNavigate('/share?id=<id>')`. The web's share page then asks for the items by that id and sends
// them the way it sends a pick from the documents picker: `StartFileTransfer` from the `file://` URI,
// and a photo's bytes read one at a time with `ReadAttachment` at the send.
//
// "Intake" because `ShareFile` already names the other direction — the web handing a file to the OS
// share sheet.
//
// The web ships before the app: a shell without these handlers answers `NOT_FOUND`, and the share page
// then has nothing to show and leaves for home.

import type { PickedShellAttachment, RefusedAttachment } from './attachment-picker';

/**
 * [Request] The items of one share, by the id the share URL carried. Not destructive: a page reload
 * asks again and gets the same answer, until `ReleaseShareIntake`.
 *
 * The reply can wait: Android copies the items after it has opened the app, and answers once the last
 * copy is written. A caller must wait longer than its default request timeout.
 *
 * Fails with `INVALID` for an id that is not one the shell makes (a UUID), `GONE` for one it does not
 * hold — released already, or cleared with the cache — and `INTERNAL` otherwise. `GONE` and not
 * `NOT_FOUND`, which the web reads as "this shell has no such handler".
 */
export type FetchShareIntakePayload = {
    id: string;
};

/** The error codes `FetchShareIntake` fails with. */
export type FetchShareIntakeErrorCode = 'INVALID' | 'GONE' | 'INTERNAL';

/** [Response] One share's items in the order the other app gave them, and the text it shared. */
export type OnFetchShareIntakePayload = {
    /**
     * Every item as the documents picker answers one: a `file`, or a `video` the shell may still have to
     * convert (`needsExport`). A photo is a `file` too; the web reads its bytes at the send.
     */
    items: PickedShellAttachment[];
    /** Items the shell did not copy, in share order — reported as a pick's refusals are. */
    refused: RefusedAttachment[];
    /** Text or a link shared with or instead of the items. Absent when there was none. */
    text?: string;
};

/**
 * [Request] Forgets a share. With `discard` the shell deletes its copies too — the person cancelled.
 * Without it the copies stay for the uploads that are reading them, until the `attach-pick` sweep —
 * which runs at the next pick — finds the folder a day old. An id the shell does not hold is not an
 * error: the release already happened.
 */
export type ReleaseShareIntakePayload = {
    id: string;
    discard: boolean;
};

/** [Response] Nothing to carry. */
export type OnReleaseShareIntakePayload = Record<string, never>;
