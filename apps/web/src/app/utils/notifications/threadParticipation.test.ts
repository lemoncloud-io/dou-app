import { threadKey, threadRootNo } from './notificationModel';
import { THREAD_PARTICIPATIONS_MAX, rememberThread, type ThreadParticipations } from './threadParticipation';

describe('rememberThread', () => {
    it('starts a thread with what is known of its root', () => {
        const next = rememberThread({}, 'k', { rootMine: true, rootPreview: 'root' }, 5);
        expect(next.k).toEqual({ rootMine: true, rootPreview: 'root', lastAt: 5 });
    });

    it('keeps what is known when a later patch knows less', () => {
        const held = rememberThread({}, 'k', { rootMine: false, rootPreview: 'root' }, 5);
        const next = rememberThread(held, 'k', {}, 9);
        expect(next.k).toEqual({ rootMine: false, rootPreview: 'root', lastAt: 9 });
    });

    it('returns the same map when nothing changes', () => {
        const held = rememberThread({}, 'k', { rootMine: true }, 5);
        expect(rememberThread(held, 'k', { rootMine: true }, 3)).toBe(held);
    });

    it('forgets the least recently active thread over the cap', () => {
        let threads: ThreadParticipations = {};
        for (let i = 0; i < THREAD_PARTICIPATIONS_MAX; i++) threads = rememberThread(threads, `t${i}`, {}, i + 1);
        threads = rememberThread(threads, 'new', {}, 10_000);
        expect(Object.keys(threads)).toHaveLength(THREAD_PARTICIPATIONS_MAX);
        expect(threads.t0).toBeUndefined();
        expect(threads.new).toBeDefined();
    });
});

describe('thread ids', () => {
    it('reads the root chatNo from either parentId shape', () => {
        expect(threadRootNo('12')).toBe('12');
        expect(threadRootNo('ch1:12')).toBe('12');
    });

    it('keys a thread by cloud, room and root', () => {
        expect(threadKey('c1', 'ch1', '12')).toBe('c1:ch1:12');
    });
});
