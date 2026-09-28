import type { UploadCompleteInput, UploadStartInput } from '@lemoncloud/chatic-sockets-lib';
import type { UploadCompleteResultMirror, UploadStartResultMirror } from '../../uploads/types';
import { parseUploadCompleteResult, parseUploadStartResult } from '../../uploads/types';
import type { UploadSocketDomainGateway } from '../gateways';

export type { UploadCompleteInput, UploadStartInput };

export interface IUploadSocketDataSource {
    /** Declares slots and receives one ticket per slot, in the same order. */
    start(payload: UploadStartInput): Promise<UploadStartResultMirror>;
    /** Settles slots — failed transfers included — and receives each upload's final status. */
    complete(payload: UploadCompleteInput): Promise<UploadCompleteResultMirror>;
}

/**
 * Upload remote source. The SDK types both answers as `any` (see `uploads/types.ts`), so this is
 * the boundary where they are checked: an answer that does not match the mirror rejects here, as
 * a failed socket operation, and nothing past this class ever holds the untyped value.
 *
 * It takes no `DataContext` because it caches nothing — an upload has no local row of its own.
 */
export class UploadSocketDataSource implements IUploadSocketDataSource {
    constructor(private readonly gateway: UploadSocketDomainGateway) {}

    public async start(payload: UploadStartInput): Promise<UploadStartResultMirror> {
        return parseUploadStartResult(await this.gateway.start<unknown>(payload));
    }

    public async complete(payload: UploadCompleteInput): Promise<UploadCompleteResultMirror> {
        return parseUploadCompleteResult(await this.gateway.complete<unknown>(payload));
    }
}
