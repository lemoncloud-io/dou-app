import type { SocketBindingConfig } from '@chatic/transport';

export interface RuntimeSocketSlot {
    config: SocketBindingConfig;
    identityToken?: string;
}

export interface RuntimeSocketSlots {
    relay?: RuntimeSocketSlot;
    cloud?: RuntimeSocketSlot;
    background?: RuntimeSocketSlot[];
}
