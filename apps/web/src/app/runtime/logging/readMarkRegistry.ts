export interface IReadMarkRegistry {
    record(channelId: string, chatNo: number): void;
    markOf(channelId: string): number | undefined;
    reset(): void;
}

class ReadMarkRegistry implements IReadMarkRegistry {
    private static readonly MAX_ENTRIES = 100;

    private readonly marks = new Map<string, number>();

    record(channelId: string, chatNo: number): void {
        if (!channelId || !Number.isFinite(chatNo)) return;

        const current = this.marks.get(channelId);
        if (current !== undefined && current >= chatNo) return;

        this.marks.delete(channelId);
        this.marks.set(channelId, chatNo);

        if (this.marks.size > ReadMarkRegistry.MAX_ENTRIES) {
            const oldest = this.marks.keys().next();
            if (!oldest.done) this.marks.delete(oldest.value);
        }
    }

    markOf(channelId: string): number | undefined {
        return this.marks.get(channelId);
    }

    reset(): void {
        this.marks.clear();
    }
}

export const readMarkRegistry: IReadMarkRegistry = new ReadMarkRegistry();
