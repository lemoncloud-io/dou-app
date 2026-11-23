import type { ImageLoadObserver, ImageLoadReport } from '../../features/channels/hooks/useCachedImages';
import type { ImageRefreshObserver, ImageRefreshReport } from '../../features/channels/hooks/useImageAddressRefresh';

import {
    IMAGE_LOAD_SAMPLES_PER_MINUTE,
    IMAGE_LOAD_SAMPLES_PER_VARIANT_PER_MINUTE,
    IMAGE_REFRESH_SAMPLES_PER_MINUTE,
    IMAGE_SAMPLES_WHILE_HELD,
    observeImageLoads,
} from './imageLoadTrace';

const load = (overrides: Partial<ImageLoadReport> = {}): ImageLoadReport => ({
    variant: 'thumb',
    source: 'network',
    store: 'miss',
    totalMs: 210.6,
    storeMs: 4.2,
    fetchMs: 205.1,
    bytes: 40_960,
    ...overrides,
});

const refresh = (overrides: Partial<ImageRefreshReport> = {}): ImageRefreshReport => ({
    kind: 'image',
    outcome: 'ok',
    ms: 318.4,
    ...overrides,
});

const setup = (options: { hidden?: boolean; held?: () => boolean } = {}) => {
    let onLoad: ImageLoadObserver | undefined;
    let onRefresh: ImageRefreshObserver | undefined;
    const setLoadObserver = jest.fn((next?: ImageLoadObserver) => (onLoad = next));
    const setRefreshObserver = jest.fn((next?: ImageRefreshObserver) => (onRefresh = next));
    const record = jest.fn();
    let clock = 0;
    let hides = 0;
    const stop = observeImageLoads({
        setLoadObserver,
        setRefreshObserver,
        record,
        now: () => clock,
        isHidden: () => options.hidden ?? false,
        isHeld: options.held,
        hideCount: () => hides,
    });
    return {
        record,
        stop,
        setLoadObserver,
        setRefreshObserver,
        beginLoad: () => {
            const end = onLoad?.();
            return (report: ImageLoadReport = load()) => end?.(report);
        },
        beginRefresh: () => {
            const end = onRefresh?.();
            return (report: ImageRefreshReport = refresh()) => end?.(report);
        },
        emitLoad: (report: ImageLoadReport = load()) => onLoad?.()?.(report),
        emitRefresh: (report: ImageRefreshReport = refresh()) => onRefresh?.()?.(report),
        advance: (ms: number) => (clock += ms),
        hide: () => (hides += 1),
    };
};

describe('observeImageLoads', () => {
    it('records a kept download as an image_load sample, in whole ms and KB', () => {
        const { record, emitLoad } = setup();

        emitLoad();

        expect(record).toHaveBeenCalledWith('image_load', {
            attributes: { variant: 'thumb', source: 'network', store: 'miss' },
            metrics: { value_ms: 211, store_ms: 4, fetch_ms: 205, bytes_kb: 40 },
        });
    });

    it('records why an address was drawn, and leaves out what was never measured', () => {
        const { record, emitLoad } = setup();

        emitLoad(load({ source: 'address', fallback: 'backoff', fetchMs: undefined, bytes: undefined }));

        expect(record).toHaveBeenCalledWith('image_load', {
            attributes: { variant: 'thumb', source: 'address', store: 'miss', fallback: 'backoff' },
            metrics: { value_ms: 211, store_ms: 4 },
        });
    });

    it('records a re-read as an image_refresh sample', () => {
        const { record, emitRefresh } = setup();

        emitRefresh(refresh({ kind: 'file', outcome: 'failed', ms: 1200.7 }));

        expect(record).toHaveBeenCalledWith('image_refresh', {
            attributes: { kind: 'file', outcome: 'failed' },
            metrics: { value_ms: 1201 },
        });
    });

    it('drops a load or re-read the page was hidden during, though it ended visible', () => {
        const { record, beginLoad, beginRefresh, hide } = setup();
        const endLoad = beginLoad();
        const endRefresh = beginRefresh();

        hide();
        endLoad();
        endRefresh();

        expect(record).not.toHaveBeenCalled();
    });

    it('records a load that began after the page was last hidden', () => {
        const { record, beginLoad, hide } = setup();
        hide();

        beginLoad()();

        expect(record).toHaveBeenCalledTimes(1);
    });

    it('records nothing while the page is hidden', () => {
        const { record, emitLoad, emitRefresh } = setup({ hidden: true });

        emitLoad();
        emitRefresh();

        expect(record).not.toHaveBeenCalled();
    });

    it('caps a minute of loads, and starts again the next minute', () => {
        const { record, emitLoad, advance } = setup();

        for (let i = 0; i < 20; i += 1) emitLoad(load({ variant: i % 2 ? 'org' : 'thumb' }));
        expect(record).toHaveBeenCalledTimes(IMAGE_LOAD_SAMPLES_PER_MINUTE);

        advance(60_000);
        emitLoad();
        expect(record).toHaveBeenCalledTimes(IMAGE_LOAD_SAMPLES_PER_MINUTE + 1);
    });

    it('keeps part of the minute for the other variant', () => {
        const { record, emitLoad } = setup();

        for (let i = 0; i < 20; i += 1) emitLoad(load({ variant: 'thumb' }));
        emitLoad(load({ variant: 'org' }));

        const variants = record.mock.calls.map(([, sample]) => sample.attributes.variant);
        expect(variants.filter(v => v === 'thumb')).toHaveLength(IMAGE_LOAD_SAMPLES_PER_VARIANT_PER_MINUTE);
        expect(variants).toContain('org');
    });

    it('caps re-reads apart from loads', () => {
        const { record, emitLoad, emitRefresh } = setup();

        for (let i = 0; i < 20; i += 1) emitLoad();
        for (let i = 0; i < 10; i += 1) emitRefresh();

        const refreshes = record.mock.calls.filter(([name]) => name === 'image_refresh');
        expect(refreshes).toHaveLength(IMAGE_REFRESH_SAMPLES_PER_MINUTE);
    });

    it('keeps only a few samples while traces are held for the WebAppReady report', () => {
        let held = true;
        const { record, emitLoad, emitRefresh } = setup({ held: () => held });

        for (let i = 0; i < 4; i += 1) emitLoad();
        emitRefresh();
        expect(record).toHaveBeenCalledTimes(IMAGE_SAMPLES_WHILE_HELD);

        held = false;
        emitLoad();
        expect(record).toHaveBeenCalledTimes(IMAGE_SAMPLES_WHILE_HELD + 1);
    });

    it('clears both observers when stopped', () => {
        const { stop, setLoadObserver, setRefreshObserver } = setup();

        stop();

        expect(setLoadObserver).toHaveBeenLastCalledWith(undefined);
        expect(setRefreshObserver).toHaveBeenLastCalledWith(undefined);
    });
});
