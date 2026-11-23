import type { DataContext, DataContextProvider } from '@chatic/data';

export interface BoundCidSource {
    getBoundCid(): string | null;
}

export class ActiveScope implements DataContextProvider {
    constructor(
        private readonly readSelected: () => DataContext,
        private readonly socket: BoundCidSource,
        private readonly committedCloudId: () => string | null
    ) {}

    public get selected(): DataContext {
        return this.readSelected();
    }

    public get bound(): { cid: string | null } {
        return { cid: this.socket.getBoundCid() };
    }

    public get committed(): { cid: string | null } {
        return { cid: this.committedCloudId() };
    }

    public getContext(): DataContext {
        const base = this.selected;
        const socketCid = this.socket.getBoundCid();
        return socketCid != null ? { ...base, socketCid } : base;
    }

    public setContext(): void {
        // intentionally empty — see the class doc.
    }
}
