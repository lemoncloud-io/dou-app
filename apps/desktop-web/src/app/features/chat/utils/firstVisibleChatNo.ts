/**
 * The first message whose row reaches into the view. Rows are in feed order, so
 * a binary search keeps this to a handful of layout reads per scroll frame.
 */
export const firstVisibleChatNo = (container: HTMLElement): number | null => {
    const top = container.getBoundingClientRect().top;
    const rows = container.querySelectorAll<HTMLElement>('[data-chat-no]');
    let low = 0;
    let high = rows.length - 1;
    let found: HTMLElement | undefined;
    while (low <= high) {
        const mid = (low + high) >> 1;
        const row = rows[mid];
        if (!row) break;
        if (row.getBoundingClientRect().bottom > top) {
            found = row;
            high = mid - 1;
        } else {
            low = mid + 1;
        }
    }
    const chatNo = Number(found?.dataset.chatNo);
    return Number.isFinite(chatNo) && chatNo > 0 ? chatNo : null;
};
