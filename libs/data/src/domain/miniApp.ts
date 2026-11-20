/**
 * What a mini app shows as, derived by the relay: `held` while an admin holds it (whatever its owner's
 * switch says), `inactive` when its owner turned it off, `active` otherwise.
 */
export type DomainMiniAppStatus = 'active' | 'inactive' | 'held';

/** One mini app of a cloud — a name and an https address its owner registered. */
export interface DomainMiniApp {
    id: string;
    name: string;
    url: string;
    /** Whether the owner turned it on. A held mini app can be enabled and still not be `active`. */
    enabled: boolean;
    /** The relay's display value. Branch on this, not on `enabled`, to decide what members see. */
    status: DomainMiniAppStatus;
}

/** Fields a new mini app is registered with. Leaving `enabled` out takes the relay's default (on). */
export interface MiniAppInput {
    name: string;
    url: string;
    enabled?: boolean;
}

/** Fields to change on a mini app; only those present are sent. */
export type MiniAppPatch = Partial<MiniAppInput>;
