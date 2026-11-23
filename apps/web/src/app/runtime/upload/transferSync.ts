import type { NativeTransfers, TransferBridge } from './nativePut';

export const syncFileTransfers = async (bridge: TransferBridge, transfers: NativeTransfers): Promise<void> => {
    const waitingBefore = transfers.waiting();
    let held;
    try {
        held = await bridge.request({ type: 'ListFileTransfers', data: {} });
    } catch {
        return;
    }
    const listed = (held.data?.transfers ?? []).filter(state => state.direction === 'upload');
    const ended: string[] = [];
    for (const state of listed) {
        if (state.state === 'running') continue;
        transfers.settle(state);
        ended.push(state.transferId);
    }
    const listedIds = new Set(listed.map(state => state.transferId));
    for (const transferId of waitingBefore) {
        if (listedIds.has(transferId)) continue;
        transfers.settle({
            transferId,
            direction: 'upload',
            state: 'failed',
            errorCode: 'SYSTEM',
            transferredBytes: 0,
            totalBytes: 0,
        });
    }
    await transfers.acknowledge(ended);
};
