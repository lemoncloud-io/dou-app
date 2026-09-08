import { storage } from '@chatic/shared';

/**
 * The identity a push registration belongs to.
 *
 * `uid` is the RELAY account id, never the active slot's — `users/0/reg-dev` registers the token
 * against the account, and a uid that followed the slot into a cloud would turn "once per install"
 * into "once per cloud switch". See `getRelaySessionUser` in `session/store/contextStore.ts`.
 */
export interface RegistrationIdentity {
    uid: string;
    deviceId: string;
    platform: string;
}

/**
 * A durable store that outlives the web layer's own — supplied by shells whose native side can hold
 * a value across a webview cache clear. Both halves are best-effort and may reject: a shell build
 * that predates the key refuses the write, and the record simply stays web-only there.
 *
 * Holds ONE entry (the current registration), not a map: a device has one active account at a time,
 * and an unbounded per-account map would grow with every account switch for no benefit.
 */
export interface NativeRecordMirror {
    read(): Promise<string | null>;
    write(raw: string): Promise<void>;
}

/** What a successful registration leaves behind. `at` is diagnostic only — there is no expiry. */
interface RegistrationEntry {
    /** The composed identity key this token was registered under. */
    id: string;
    token: string;
    at: number;
}

interface StorageLike {
    get(key: string): string | null;
    set(key: string, value: string): void;
}

const parseEntry = (raw: string | null): RegistrationEntry | null => {
    if (!raw) return null;
    try {
        const entry = JSON.parse(raw) as Partial<RegistrationEntry>;
        // A corrupted or half-written record must read as "never registered" rather than throw: the
        // cost is one extra registration, and the alternative would break the boot path.
        return entry.token ? { id: entry.id ?? '', token: entry.token, at: entry.at ?? 0 } : null;
    } catch {
        return null;
    }
};

/**
 * The "this device already registered" record, persisted across launches (ADR-0077).
 *
 * Registration used to run on every launch and every foreground return, always forced. That was a
 * deliberate choice — SNS disables a platform endpoint after a single failed delivery and
 * `CreatePlatformEndpoint` does not revive it, so re-registering was the only client-side recovery.
 * ADR-0077 traded that recovery away for call volume: the record makes registration happen once per
 * install, and the endpoint-recovery paths that remain are listed in
 * `docs/specs/push-device-registration.md` (S8).
 *
 * The record stores the TOKEN, not a boolean, so a rotated token still re-registers — the skip is
 * "nothing changed", never "we already did this once".
 *
 * **Two tiers.** The web tier is `@chatic/shared`'s `storage`, which `libs/web-config` swaps to
 * `localStorage` inside a native shell. It is synchronous, which is what lets the foreground-return
 * path decide without a bridge round-trip. The optional native tier survives a webview cache clear;
 * it is asynchronous, so it is hydrated once via {@link hydrate} and then answers from memory. A
 * cleared web tier that the native tier can still answer for is backfilled during hydration.
 *
 * Losing both tiers costs one extra registration, which is the safe direction to fail.
 */
export class PushRegistrationRecord {
    /**
     * Bump to make every device re-register exactly once.
     *
     * This is the only broad recovery lever the app has: ADR-0077 shipped without a remote kill
     * switch, so a version bump plus a web deploy is how a bad registration state is swept.
     */
    private static readonly POLICY_VERSION = 'v1';

    // Deliberately not prefixed with '@': `libs/web-config`'s `?logout=1` sweep clears '@'-prefixed
    // keys, and losing the record on logout would buy an extra registration for nothing (the uid is
    // already part of the key, so an account switch re-registers either way).
    private static readonly KEY_PREFIX = 'push-reg';

    private native: RegistrationEntry | null = null;
    private hydration: Promise<void> | null = null;

    constructor(private readonly store: StorageLike = storage) {}

    private key({ uid, deviceId, platform }: RegistrationIdentity): string {
        return `${PushRegistrationRecord.POLICY_VERSION}:${uid}:${deviceId}:${platform}`;
    }

    private storeKey(identity: RegistrationIdentity): string {
        return `${PushRegistrationRecord.KEY_PREFIX}:${this.key(identity)}`;
    }

    /**
     * Pull the native tier into memory, at most once per instance.
     *
     * Idempotent and never rejects — a shell without the mirror, an old shell that does not know the
     * key, and a read error all resolve to "no native record", leaving the web tier in charge.
     */
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

    /** The token this identity last registered successfully, or null when it never did. */
    read(identity: RegistrationIdentity): string | null {
        const local = parseEntry(this.store.get(this.storeKey(identity)));
        if (local) return local.token;
        // The web tier was cleared (or never written on this device) but the native tier remembers.
        // Backfill so later synchronous reads — the foreground-return fast path — hit the web tier.
        if (this.native && this.native.id === this.key(identity)) {
            this.writeLocal(identity, this.native);
            return this.native.token;
        }
        return null;
    }

    /** Record a successful registration. Only ever called after the server accepted the token. */
    write(identity: RegistrationIdentity, token: string, mirror?: NativeRecordMirror): void {
        const entry: RegistrationEntry = { id: this.key(identity), token, at: Date.now() };
        this.writeLocal(identity, entry);
        if (!mirror) return;
        // Fire-and-forget: the web tier already holds the record, so a shell that refuses the write
        // (an app build predating the key) just keeps the pre-native behaviour. `native` is set only
        // once the shell has actually accepted it — claiming a native copy that does not exist would
        // let a later read skip a registration on the strength of a tier that cannot answer.
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
