/**
 * `components/report-logs/ReportDetailPanel.spec.tsx`
 *
 * The panel shell is the genuinely new code in the drawer→panel change (ADR-0083);
 * `ReportDetailBody.spec.tsx` covers the sections, which moved across unchanged. What is
 * tested here is the header: the three pin affordances and their active/unpin logic, the
 * lag badge, the clipboard payload, and the empty state.
 */
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import type { ReportLogRow } from '../lib/parseReportLog';
import { ReportDetailPanel } from './ReportDetailPanel';

const row = (over: Partial<ReportLogRow> = {}): ReportLogRow => ({
    id: 'r1',
    type: 'log-entry',
    title: 'auth',
    tag: 'auth',
    level: 'error',
    message: '로그인 실패',
    userId: 'u1',
    cid: 'c1',
    runId: 'run-a',
    createdAt: 1_700_000_000_000,
    timestamp: 1_700_000_000_000,
    payload: null,
    raw: { message: '로그인 실패' },
    parseError: false,
    ...over,
});

const setup = (over: Partial<ReportLogRow> | null = {}, props: Record<string, unknown> = {}) => {
    const onPin = vi.fn();
    const onUnpin = vi.fn();
    const onClose = vi.fn();
    render(
        <ReportDetailPanel
            row={over === null ? null : row(over)}
            onClose={onClose}
            onPin={onPin}
            onUnpin={onUnpin}
            pinned={{}}
            {...props}
        />
    );
    return { onPin, onUnpin, onClose };
};

describe('ReportDetailPanel — 빈 상태', () => {
    it('reserves the column and says what fills it', () => {
        setup(null);

        expect(screen.getByText('Select a row to open its detail here.')).toBeTruthy();
    });
});

describe('ReportDetailPanel — 추적 핀', () => {
    it('offers all three axes the backend can filter on', () => {
        setup();

        expect(screen.getByTitle('Track user u1 (server query)')).toBeTruthy();
        expect(screen.getByTitle('Track cloud c1 (server query)')).toBeTruthy();
        expect(screen.getByTitle('Track run run-a (server query)')).toBeTruthy();
    });

    it('pins the axis it was clicked on', () => {
        const { onPin } = setup();

        fireEvent.click(screen.getByTitle('Track cloud c1 (server query)'));

        expect(onPin).toHaveBeenCalledWith('cid', 'c1');
    });

    it('offers to unpin the axis that is already pinned', () => {
        // The comparison that decides this is `pinned.uid === uid` — the kind of thing
        // that silently inverts.
        const { onUnpin, onPin } = setup({}, { pinned: { uid: 'u1' } });

        fireEvent.click(screen.getByTitle('Untrack user — u1'));

        expect(onUnpin).toHaveBeenCalledWith('uid');
        expect(onPin).not.toHaveBeenCalled();
    });

    it('does not treat a different pinned value as this row being pinned', () => {
        const { onPin } = setup({}, { pinned: { uid: 'someone-else' } });

        fireEvent.click(screen.getByTitle('Track user u1 (server query)'));

        expect(onPin).toHaveBeenCalledWith('uid', 'u1');
    });

    it('shows a dash instead of a pin for an axis the row lacks', () => {
        setup({ cid: undefined });

        expect(screen.queryByTitle(/Track cloud .* \(server query\)/)).toBeNull();
    });
});

describe('ReportDetailPanel — 시각', () => {
    it('flags a row whose upload lagged its occurrence', () => {
        setup({ timestamp: 1_700_000_000_000 - 600_000 });

        expect(screen.getByText('+10m lag')).toBeTruthy();
    });

    it('does not flag the ordinary flush delay', () => {
        setup({ timestamp: 1_700_000_000_000 - 3_000 });

        expect(screen.queryByText(/lag/)).toBeNull();
    });
});

describe('ReportDetailPanel — 헤더 동작', () => {
    it('copies the record with attachments redacted', async () => {
        // A single attached screenshot is ~100 KB of base64; the Raw block on screen
        // already redacts, and the clipboard must not diverge from it.
        const writeText = vi.fn().mockResolvedValue(undefined);
        Object.assign(navigator, { clipboard: { writeText } });
        const image = `data:image/png;base64,${'A'.repeat(500)}`;
        setup({ raw: { images: [image] } });

        fireEvent.click(screen.getByText('Copy'));

        expect(writeText).toHaveBeenCalledOnce();
        const copied = writeText.mock.calls[0][0] as string;
        expect(copied).not.toContain('AAAAAAAAAA');
        expect(copied).toContain('omitted');
    });

    it('jumps to observe with the row uid', () => {
        const onObserve = vi.fn();
        setup({}, { onObserve });

        fireEvent.click(screen.getByText('Observe'));

        expect(onObserve).toHaveBeenCalledWith('u1');
    });

    it('hides the observe jump when the row has no uid', () => {
        setup({ userId: undefined }, { onObserve: vi.fn() });

        expect(screen.queryByText('Observe')).toBeNull();
    });

    it('closes on Escape, which is the only keyboard way out of the overlay form', () => {
        const { onClose } = setup();

        fireEvent.keyDown(window, { key: 'Escape' });

        expect(onClose).toHaveBeenCalledOnce();
    });

    it('closes from the close button', () => {
        const { onClose } = setup();

        fireEvent.click(screen.getByLabelText('Close'));

        expect(onClose).toHaveBeenCalledOnce();
    });
});
