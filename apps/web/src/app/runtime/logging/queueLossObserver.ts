import { logger, type ObservationData } from '@chatic/bridges';

import { getLogQueueView } from './logQueueView';

export interface IQueueLossObserver {
    observe(): void;
    reset(): void;
}

class QueueLossObserver implements IQueueLossObserver {
    private lastSeen = 0;

    observe(): void {
        const view = getLogQueueView();
        if (!view) return;

        const total = view.droppedCount();
        if (total < this.lastSeen) {
            this.lastSeen = total;
            return;
        }

        const delta = total - this.lastSeen;
        if (delta === 0) return;

        this.lastSeen = total;
        logger.warn('LOG_BUFFER', `log queue evicted ${delta} entr${delta === 1 ? 'y' : 'ies'}`, {
            observation: 'queue-loss',
            dropped: delta,
            droppedTotal: total,
        } satisfies ObservationData);
    }

    reset(): void {
        this.lastSeen = 0;
    }
}

export const queueLossObserver: IQueueLossObserver = new QueueLossObserver();
