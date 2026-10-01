import type { NativeTransfers, TransferBridge } from './nativePut';

/**
 * Catches up with the shell after the page was away — reloaded, or suspended in the background
 * while the shell kept moving bytes. A terminal state announced in that window was never heard, so
 * the shell holds it until acknowledged; this reads what it holds, settles the uploads this page is
 * still waiting on, and acknowledges every ended transfer.
 *
 * **An ended transfer this page does not know is acknowledged and dropped.** It belongs to a page
 * that no longer exists (a reload), and the message it was for lived only in that page's memory,
 * so nothing here could send it. Running transfers are left alone: their event is still to come.
 *
 * **A transfer this page waits on that the shell no longer holds has been lost** — dropped at the
 * shell's cap for unacknowledged results, or with the shell's own state. It is settled as a system
 * failure, because nothing would ever settle it otherwise and its message would stay "sending".
 *
 * Downloads are left alone — they have a reader of their own (`runtime/transfer`).
 *
 * Safe to run on a shell without the transfer module — the list request fails and nothing happens.
 */
export const syncFileTransfers = async (bridge: TransferBridge, transfers: NativeTransfers): Promise<void> => {
    if (transfers.usesFallback()) return;
    // Only transfers accepted before the list was asked for can be judged missing from it.
    const waitingBefore = transfers.waiting();
    let held;
    try {
        held = await bridge.request({ type: 'ListFileTransfers', data: {} });
    } catch {
        return;
    }
    // Uploads only. A download belongs to the image export, which acknowledges it after the file is
    // saved or shared; taking it here would drop the file out from under it.
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
