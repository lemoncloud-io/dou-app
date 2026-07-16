import type { PointerEvent as ReactPointerEvent } from 'react';

import { act, renderHook } from '@testing-library/react';

import { DRAG_THRESHOLD_PX, type Position, useDraggable } from './useDraggable';

const KEY = 'issue-report:test-pos';
const getDefault = (): Position => ({ x: 100, y: 200 });

const fakeElement = () =>
    ({
        getBoundingClientRect: () => ({ left: 0, top: 0, width: 50, height: 50, right: 50, bottom: 50 }),
        offsetWidth: 50,
        offsetHeight: 50,
        setPointerCapture: jest.fn(),
        releasePointerCapture: jest.fn(),
    }) as unknown as HTMLDivElement;

const pointer = (x: number, y: number, target: HTMLDivElement): ReactPointerEvent =>
    ({ clientX: x, clientY: y, pointerId: 1, target }) as unknown as ReactPointerEvent;

beforeEach(() => {
    localStorage.clear();
});

describe('useDraggable — 초기 위치', () => {
    it('저장값이 없으면 기본 위치를 쓴다', () => {
        const { result } = renderHook(() => useDraggable(KEY, getDefault));
        expect(result.current.position).toEqual({ x: 100, y: 200 });
    });

    it('localStorage에 저장된 위치를 복원한다', () => {
        localStorage.setItem(KEY, JSON.stringify({ x: 5, y: 6 }));
        const { result } = renderHook(() => useDraggable(KEY, getDefault));
        expect(result.current.position).toEqual({ x: 5, y: 6 });
    });

    it('손상된 저장값은 기본 위치로 폴백한다', () => {
        localStorage.setItem(KEY, 'not-json');
        const { result } = renderHook(() => useDraggable(KEY, getDefault));
        expect(result.current.position).toEqual({ x: 100, y: 200 });
    });

    it('초기 didDrag는 false다', () => {
        const { result } = renderHook(() => useDraggable(KEY, getDefault));
        expect(result.current.didDrag()).toBe(false);
    });
});

describe('useDraggable — 드래그 vs 클릭', () => {
    it('임계값 미만 이동은 클릭으로 간주하고 위치를 유지한다', () => {
        const { result } = renderHook(() => useDraggable(KEY, getDefault));
        const el = fakeElement();
        result.current.ref.current = el;

        act(() => result.current.dragHandlers.onPointerDown(pointer(10, 10, el)));
        act(() => result.current.dragHandlers.onPointerMove(pointer(12, 12, el)));
        act(() => result.current.dragHandlers.onPointerUp(pointer(12, 12, el)));

        expect(result.current.didDrag()).toBe(false);
        expect(result.current.position).toEqual({ x: 100, y: 200 });
        expect(localStorage.getItem(KEY)).toBeNull();
    });

    it('임계값 이상 이동은 드래그로 처리하고 pointerup에 위치를 저장한다', () => {
        const { result } = renderHook(() => useDraggable(KEY, getDefault));
        const el = fakeElement();
        result.current.ref.current = el;

        const endY = 10 + DRAG_THRESHOLD_PX + 5;
        act(() => result.current.dragHandlers.onPointerDown(pointer(10, 10, el)));
        act(() => result.current.dragHandlers.onPointerMove(pointer(10, endY, el)));
        act(() => result.current.dragHandlers.onPointerUp(pointer(10, endY, el)));

        expect(result.current.didDrag()).toBe(true);
        // dx = 10 - 0 = 10 → x = 10 - 10 = 0; dy = 10 → y = endY - 10.
        expect(result.current.position).toEqual({ x: 0, y: endY - 10 });
        expect(JSON.parse(localStorage.getItem(KEY) as string)).toEqual({ x: 0, y: endY - 10 });
    });
});
