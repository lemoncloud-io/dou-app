import { sessionStores } from '@chatic/session';

export interface RegistrationIdentity {
    uid: string;
    deviceId: string;
    platform: string;
}

export interface NativeRecordMirror {
    read(): Promise<string | null>;
    write(raw: string): Promise<void>;
}

interface RegistrationEntry {
    id: string;
    token: string;
    at: number;
}

interface StorageLike {
    get(key: string): string | null;
    set(key: string, value: string): void;
}

const plainStore: StorageLike = {
    get: key => sessionStores.of('plain').get(key),
    set: (key, value) => sessionStores.of('plain').set(key, value),
};

const parseEntry = (raw: string | null): RegistrationEntry | null => {
    if (!raw) return null;
    try {
        const entry = JSON.parse(raw) as Partial<RegistrationEntry>;
        return entry.token ? { id: entry.id ?? '', token: entry.token, at: entry.at ?? 0 } : null;
    } catch {
        return null;
    }
};

export class PushRegistrationRecord {
    private static readonly POLICY_VERSION = 'v1';

    private static readonly KEY_PREFIX = 'push-reg';

    private native: RegistrationEntry | null = null;
    private hydration: Promise<void> | null = null;

    constructor(private readonly store: StorageLike = plainStore) {}

    private key({ uid, deviceId, platform }: RegistrationIdentity): string {
        return `${PushRegistrationRecord.POLICY_VERSION}:${uid}:${deviceId}:${platform}`;
    }

    private storeKey(identity: RegistrationIdentity): string {
        return `${PushRegistrationRecord.KEY_PREFIX}:${this.key(identity)}`;
    }

    hydrate(mirror: NativeRecordMirror | undefined): Promise<void> {
        if (!mirror) return Promise.resolve();
        if (this.hydration) return this.hydration;
        this.hydration = mirror
            .read()
            .then(raw => {
                this.native = parseEntry(raw);
            })
            .catch(() => {
                this.native = null;
            });
        return this.hydration;
    }

    read(identity: RegistrationIdentity): string | null {
        const local = parseEntry(this.store.get(this.storeKey(identity)));
        if (local) return local.token;
        if (this.native && this.native.id === this.key(identity)) {
            this.writeLocal(identity, this.native);
            return this.native.token;
        }
        return null;
    }

    write(identity: RegistrationIdentity, token: string, mirror?: NativeRecordMirror): void {
        const entry: RegistrationEntry = { id: this.key(identity), token, at: Date.now() };
        this.writeLocal(identity, entry);
        if (!mirror) return;
        void mirror
            .write(JSON.stringify(entry))
            .then(() => {
                this.native = entry;
            })
            .catch(() => undefined);
    }

    private writeLocal(identity: RegistrationIdentity, entry: RegistrationEntry): void {
        try {
            this.store.set(this.storeKey(identity), JSON.stringify(entry));
        } catch {
            // Storage can be full or blocked. Losing the record only means the next launch registers
            // again — never worth failing a registration that already succeeded.
        }
    }
}
