export type SessionOwner = 'web' | 'native';

export const SESSION_OWNER_KEY = 'sessionOwner';

export const DEFAULT_SESSION_OWNER_KEY = 'defaultSessionOwner';

export interface SessionOwnerFile {
    getString(key: string): string | undefined;
    set(key: string, value: string): void;
    remove(key: string): boolean;
}

const isSessionOwner = (value: string | undefined): value is SessionOwner => value === 'web' || value === 'native';

export const defaultSessionOwner = (stage: string | undefined, override?: string): SessionOwner => {
    const raw = (stage ?? '').toUpperCase();
    if (raw !== 'LOCAL' && raw !== 'DEV' && raw !== 'PROD') return 'web';
    if (isSessionOwner(override)) return override;
    return raw === 'LOCAL' ? 'web' : 'native';
};

const isRecognisedStage = (stage: string | undefined): boolean =>
    ['LOCAL', 'DEV', 'PROD'].includes((stage ?? '').toUpperCase());

export type SessionOwnerSource = 'switch' | 'build' | 'page' | 'stage' | 'unreadable';

export interface SessionOwnerChoice {
    owner: SessionOwner;
    source: SessionOwnerSource;
}

export const unswitchedSessionOwnerChoice = (
    stage: string | undefined,
    override: string | undefined,
    pageDefault: SessionOwner | undefined
): SessionOwnerChoice => {
    if (!isRecognisedStage(stage)) return { owner: 'web', source: 'stage' };
    if (isSessionOwner(override)) return { owner: override, source: 'build' };
    if (pageDefault) return { owner: pageDefault, source: 'page' };
    return { owner: defaultSessionOwner(stage), source: 'stage' };
};

export const unswitchedSessionOwner = (
    stage: string | undefined,
    override: string | undefined,
    pageDefault: SessionOwner | undefined
): SessionOwner => unswitchedSessionOwnerChoice(stage, override, pageDefault).owner;

export const readSessionOwner = (file: SessionOwnerFile, fallback: SessionOwner = 'web'): SessionOwner => {
    const stored = file.getString(SESSION_OWNER_KEY);
    return isSessionOwner(stored) ? stored : fallback;
};

export const readSessionOwnerChoice = (file: SessionOwnerFile, fallback: SessionOwnerChoice): SessionOwnerChoice => {
    const stored = file.getString(SESSION_OWNER_KEY);
    return isSessionOwner(stored) ? { owner: stored, source: 'switch' } : fallback;
};

export const writeSessionOwner = (file: SessionOwnerFile, owner: SessionOwner): void =>
    file.set(SESSION_OWNER_KEY, owner);

export const readDefaultSessionOwner = (file: SessionOwnerFile): SessionOwner | undefined => {
    const stored = file.getString(DEFAULT_SESSION_OWNER_KEY);
    return isSessionOwner(stored) ? stored : undefined;
};

export const writeDefaultSessionOwner = (file: SessionOwnerFile, owner: SessionOwner | null): void => {
    if (owner === null) file.remove(DEFAULT_SESSION_OWNER_KEY);
    else file.set(DEFAULT_SESSION_OWNER_KEY, owner);
};
