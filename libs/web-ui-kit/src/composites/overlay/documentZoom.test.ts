import {
    clampDocumentZoom,
    DOCUMENT_DOUBLE_TAP_ZOOM,
    DOCUMENT_MAX_ZOOM,
    DOCUMENT_MIN_ZOOM,
    documentZoomScroll,
    doubleTapDocumentZoom,
    isDocumentDoubleTap,
} from './documentZoom';

describe('clampDocumentZoom', () => {
    it('keeps the zoom between the fitted width and the most a page grows', () => {
        expect(clampDocumentZoom(0.4)).toBe(DOCUMENT_MIN_ZOOM);
        expect(clampDocumentZoom(2.5)).toBe(2.5);
        expect(clampDocumentZoom(9)).toBe(DOCUMENT_MAX_ZOOM);
        expect(clampDocumentZoom(Number.NaN)).toBe(DOCUMENT_MIN_ZOOM);
    });
});

describe('doubleTapDocumentZoom', () => {
    it('enlarges a fitted page, and fits any enlarged one back', () => {
        expect(doubleTapDocumentZoom(1)).toBe(DOCUMENT_DOUBLE_TAP_ZOOM);
        expect(doubleTapDocumentZoom(2)).toBe(1);
        expect(doubleTapDocumentZoom(3.4)).toBe(1);
    });
});

describe('isDocumentDoubleTap', () => {
    const first = { x: 100, y: 200, at: 1000 };

    it('is a second tap close in time and place', () => {
        expect(isDocumentDoubleTap(first, { x: 110, y: 205, at: 1250 })).toBe(true);
    });

    it('is not one too late, too far, or with no first tap', () => {
        expect(isDocumentDoubleTap(first, { x: 100, y: 200, at: 1400 })).toBe(false);
        expect(isDocumentDoubleTap(first, { x: 180, y: 200, at: 1100 })).toBe(false);
        expect(isDocumentDoubleTap(null, first)).toBe(false);
    });
});

describe('documentZoomScroll', () => {
    it('keeps the content under the focal point where it was', () => {
        // The point 100px into a scroll at 0 sits at 200px once doubled, and the scroll moves 100px.
        expect(documentZoomScroll({ x: 0, y: 300 }, { x: 100, y: 50 }, 1, 2)).toEqual({ x: 100, y: 650 });
    });

    it('never scrolls past the top-left edge when zooming out', () => {
        expect(documentZoomScroll({ x: 10, y: 10 }, { x: 300, y: 300 }, 2, 1)).toEqual({ x: 0, y: 0 });
    });
});
