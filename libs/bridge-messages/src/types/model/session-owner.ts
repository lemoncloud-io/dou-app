export type SessionOwnerName = 'web' | 'native';

export type FetchSessionOwnerPayload = {};

export type OnFetchSessionOwnerPayload = {
    current: SessionOwnerName;
    next: SessionOwnerName;
};

export type SetSessionOwnerPayload = {
    owner: SessionOwnerName;
};

export type OnSetSessionOwnerPayload = {
    next: SessionOwnerName;
    restarting: boolean;
};

export type SetDefaultSessionOwnerPayload = {
    owner: SessionOwnerName | null;
};

export type OnSetDefaultSessionOwnerPayload = {
    default: SessionOwnerName | null;
    next: SessionOwnerName;
};
