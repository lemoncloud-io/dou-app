import type { PickedShellAttachment, RefusedAttachment } from './attachment-picker';

export type FetchShareIntakePayload = {
    id: string;
};

export type FetchShareIntakeErrorCode = 'INVALID' | 'GONE' | 'INTERNAL';

export type OnFetchShareIntakePayload = {
    items: PickedShellAttachment[];
    refused: RefusedAttachment[];
    text?: string;
};

export type ReleaseShareIntakePayload = {
    id: string;
    discard: boolean;
};

export type OnReleaseShareIntakePayload = Record<string, never>;
