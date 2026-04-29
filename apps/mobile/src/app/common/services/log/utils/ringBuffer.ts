export interface RingBuffer<T> {
    /** 버퍼 끝에 데이터를 추가한다. */
    push(item: T): void;
    /** 오래된 데이터부터 최대 count개를 조회한다(삭제하지 않음). */
    peek(count?: number): T[];
    /** 오래된 데이터부터 최대 count개를 꺼내고 삭제한다. */
    shift(count?: number): T[];
    /** 버퍼를 비운다. */
    clear(): void;
    /** 현재 저장된 데이터 개수를 반환한다. */
    size(): number;
    /** 전체 데이터를 FIFO 순서 배열로 반환한다. */
    toArray(): T[];
    /** 외부 배열 데이터로 버퍼를 복원한다. */
    load(items: T[]): void;
}

/**
 * 동적 확장 링 버퍼 생성 함수.
 * - 기본 용량은 64
 * - push 시 용량이 부족하면 2배씩 확장
 * - peek/shift는 FIFO(오래된 순) 기준으로 동작
 */
export const createRingBuffer = <T>(initialCapacity = 64): RingBuffer<T> => {
    // 초기 용량은 최소 1 이상으로 고정한다.
    const safeInitialCapacity = Math.max(1, initialCapacity);
    let buffer: (T | undefined)[] = new Array(safeInitialCapacity);
    let head = 0; // 가장 오래된 요소 인덱스
    let length = 0; // 현재 요소 개수

    // 다음 삽입 위치(꼬리 인덱스)를 계산한다.
    const tailIndex = () => (head + length) % buffer.length;

    // 필요한 크기(requiredSize)까지 버퍼를 확장한다.
    const ensureCapacity = (requiredSize: number) => {
        if (requiredSize <= buffer.length) return;

        let nextCapacity = buffer.length;
        while (nextCapacity < requiredSize) nextCapacity *= 2;

        const nextBuffer: (T | undefined)[] = new Array(nextCapacity);
        for (let i = 0; i < length; i += 1) {
            nextBuffer[i] = buffer[(head + i) % buffer.length];
        }

        buffer = nextBuffer;
        head = 0;
    };

    // 삭제 없이 앞에서 count개를 조회한다.
    const peek = (count = length): T[] => {
        const takeCount = Math.max(0, Math.min(length, count));
        const entries: T[] = [];

        for (let i = 0; i < takeCount; i += 1) {
            const item = buffer[(head + i) % buffer.length];
            if (item !== undefined) entries.push(item);
        }

        return entries;
    };

    return {
        push: (item: T) => {
            ensureCapacity(length + 1);
            buffer[tailIndex()] = item;
            length += 1;
        },

        peek,

        shift: (count = length): T[] => {
            const takeCount = Math.max(0, Math.min(length, count));
            const entries: T[] = [];

            for (let i = 0; i < takeCount; i += 1) {
                const index = (head + i) % buffer.length;
                const item = buffer[index];
                if (item !== undefined) entries.push(item);
                buffer[index] = undefined;
            }

            head = (head + takeCount) % buffer.length;
            length -= takeCount;

            if (length === 0) {
                // 버퍼가 비면 head를 원점으로 되돌려 이후 계산을 단순화한다.
                head = 0;
            }

            return entries;
        },

        clear: () => {
            buffer = new Array(safeInitialCapacity);
            head = 0;
            length = 0;
        },

        size: () => length,

        toArray: () => peek(length),

        load: (items: T[]) => {
            const normalized = items ?? [];
            const nextCapacity = Math.max(safeInitialCapacity, normalized.length || 0);
            buffer = new Array(nextCapacity);
            head = 0;
            length = 0;

            for (const item of normalized) {
                ensureCapacity(length + 1);
                buffer[tailIndex()] = item;
                length += 1;
            }
        },
    };
};
