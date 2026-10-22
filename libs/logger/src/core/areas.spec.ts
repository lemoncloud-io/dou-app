import { isKnownLogArea, LOG_AREAS, logAreaOf } from './areas';
import { KNOWN_LOG_TAGS } from './tags';

describe('logAreaOf', () => {
    it('takes the part before the first dot of an event tag', () => {
        expect(logAreaOf('socket.reconnect_failed')).toBe('socket');
        expect(logAreaOf('perf.chat_room_open')).toBe('perf');
        expect(logAreaOf('a.b.c')).toBe('a');
    });

    it('lower-cases the whole of a dot-less tag', () => {
        expect(logAreaOf('SOCKET')).toBe('socket');
        expect(logAreaOf('LOG_BUFFER')).toBe('log_buffer');
    });

    it('treats a leading dot as no dot rather than an empty area', () => {
        expect(logAreaOf('.x')).toBe('.x');
    });

    it('has no area for an empty tag', () => {
        expect(logAreaOf('')).toBeUndefined();
    });
});

describe('LOG_AREAS', () => {
    it('holds every legacy tag, lower-cased, as an area', () => {
        // The legacy tags and the area list are the same catalogue read two ways, so every old tag
        // must land in a known area — otherwise an area query would lose it at the switch-over.
        for (const tag of KNOWN_LOG_TAGS) expect(isKnownLogArea(logAreaOf(tag) as string)).toBe(true);
    });

    it('has no duplicates', () => {
        expect(new Set(LOG_AREAS).size).toBe(LOG_AREAS.length);
    });

    it('has no network, push_queue or nav area', () => {
        for (const area of ['network', 'push_queue', 'nav']) expect(isKnownLogArea(area)).toBe(false);
    });
});
