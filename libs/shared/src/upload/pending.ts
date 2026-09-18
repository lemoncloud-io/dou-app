import { UPLOAD_FAILURE_CODE, UPLOAD_FAILURE_SOURCE } from 'lemon-model/upload';

import type {
    UploadBody,
    UploadCompleteItem,
    UploadFailure,
    UploadService,
    UploadTicket,
    UploadTransferKind,
    UploadView,
} from 'lemon-model/upload';

/**
 * A slot whose bytes are up but whose completion was never confirmed.
 *
 * The three-step order assumes one process lives through all of it, and that assumption breaks the
 * moment the transfer outlives the page: a background upload finishes while the app is dead, and
 * nobody is left to call `complete`. The upload is then durable in storage and `pending` on the
 * server — invisible to the sender, and eventually swept.
 *
 * What makes the repair possible is in the contract already: the ticket outlives the transfer url
 * by design (24h against 15m), and `complete` is idempotent. So a shell that writes this record
 * down before it can be interrupted can settle the slot on the next run.
 *
 * Persisting it is the shell's job — this layer only says what has to be remembered and what to do
 * with it later.
 */
export type PendingUpload = UploadCompleteItem;

/**
 * Settles slots that were transferred but never confirmed.
 *
 * Safe to call with anything the shell has written down, including slots that were already
 * completed: `complete` is idempotent, so a duplicate confirmation returns the same stored view
 * rather than an error. An empty list is a no-op — it must not become an empty round trip.
 *
 * Failures are not swallowed: a caller that cannot reach the server should keep its records and try
 * again on the next run, which is only possible if this throws rather than reporting success.
 */
export const completePendingUploads = async (
    service: UploadService,
    pending: readonly PendingUpload[]
): Promise<UploadView[]> => {
    if (!pending.length) return [];
    const { list } = await service.complete({ list: [...pending] });
    return list;
};

/**
 * Whether a failed transfer deserves a fresh instruction rather than a fresh upload.
 *
 * A presigned url is short-lived, and the two ways it goes bad — the clock ran out, or the
 * signature no longer verifies — both mean "ask for another one", not "the file is wrong". Every
 * other failure (checksum, too large, unsupported) is about the bytes, and reissuing would only
 * produce the same answer more slowly.
 *
 * This becomes load-bearing exactly where the design gets ambitious: a background transfer that the
 * system delays can outlive its url, and then the repair is a new instruction for the SAME upload
 * id — the id a message will eventually carry.
 */
export const isReissuable = (failure?: UploadFailure): boolean =>
    !!failure &&
    failure.source === UPLOAD_FAILURE_SOURCE.storage &&
    (failure.code === UPLOAD_FAILURE_CODE.expired || failure.code === UPLOAD_FAILURE_CODE.signature);

/**
 * Asks for a new transfer instruction for an upload that is still `pending`.
 *
 * This is `start` with the id filled in, which the contract defines as a re-issue rather than a new
 * upload — the slot keeps its id, so anything already written down about it stays valid.
 *
 * Returns undefined when the server answers without an instruction: the ticket has expired, the
 * upload already stored, or the slot failed validation. None of those are retryable here, and the
 * caller decides whether to start over.
 */
export const reissueTransfer = async (
    service: UploadService,
    body: UploadBody & { id: string },
    transfers: UploadTransferKind[]
): Promise<UploadTicket | undefined> => {
    const { list } = await service.start({ list: [body], transfers });
    const ticket = list[0];
    return ticket?.transfer ? ticket : undefined;
};
