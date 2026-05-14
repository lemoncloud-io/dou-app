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
 * 링 버퍼 생성 함수.
 * - `maxCapacity`가 제공되면 고정 크기 버퍼로 동작하며, 가득 차면 가장 오래된 요소를 덮어쓴다.
 * - `maxCapacity`가 제공되지 않으면 `initialCapacity`로 시작하여 필요에 따라 2배씩 확장된다.
 * - `peek`/`shift`는 FIFO(오래된 순) 기준으로 동작한다.
 * @param initialCapacity 버퍼의 초기 용량 (기본값: 64). `maxCapacity`가 설정되면 이 값은 동적 버퍼에만 적용된다.
 * @param maxCapacity 버퍼의 최대 크기. 이 값이 설정되면 버퍼는 이 크기를 초과하여 확장되지 않으며, 가득 차면 가장 오래된 요소를 덮어쓴다.
 */
export const createRingBuffer = <T>(initialCapacity = 64, maxCapacity?: number): RingBuffer<T> => {
    const isFixedSize = maxCapacity !== undefined;
    // 고정 크기 버퍼인 경우 maxCapacity를 사용하고, 아니면 initialCapacity를 사용
    const capacity = isFixedSize ? Math.max(1, maxCapacity!) : Math.max(1, initialCapacity);

    let buffer: (T | undefined)[] = new Array(capacity);
    let head = 0; // 가장 오래된 요소 인덱스
    let length = 0; // 현재 요소 개수

    // 다음 삽입 위치(꼬리 인덱스)를 계산한다.
    const tailIndex = () => (head + length) % buffer.length;

    // 동적 버퍼인 경우에만 용량을 확장한다.
    const ensureDynamicCapacity = (requiredSize: number) => {
        if (isFixedSize) return; // 고정 크기 버퍼는 확장하지 않는다.

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

    const push = (item: T) => {
        if (isFixedSize && length === capacity) {
            // 고정 크기 버퍼가 가득 찬 경우, 가장 오래된 요소를 덮어쓴다.
            buffer[head] = item;
            head = (head + 1) % capacity; // head를 다음 위치로 이동
            // length는 capacity로 유지된다.
        } else {
            // 동적 버퍼이거나 고정 크기 버퍼가 아직 가득 차지 않은 경우
            ensureDynamicCapacity(length + 1); // 필요한 경우 버퍼 확장
            buffer[tailIndex()] = item;
            length += 1;
        }
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

    const shift = (count = length): T[] => {
        const takeCount = Math.max(0, Math.min(length, count));
        const entries: T[] = [];

        for (let i = 0; i < takeCount; i += 1) {
            const index = (head + i) % buffer.length;
            const item = buffer[index];
            if (item !== undefined) entries.push(item);
            buffer[index] = undefined; // 슬롯 비우기
        }

        head = (head + takeCount) % buffer.length;
        length -= takeCount;

        if (length === 0) {
            // 버퍼가 비면 head를 원점으로 되돌려 이후 계산을 단순화한다.
            head = 0;
        }

        return entries;
    };

    const clear = () => {
        buffer = new Array(capacity); // 초기 용량으로 버퍼 재설정
        head = 0;
        length = 0;
    };

    const toArray = () => peek(length);

    const load = (items: T[]) => {
        clear(); // 기존 버퍼 비우기
        const normalized = items ?? [];
        // 고정 크기 버퍼인 경우, maxCapacity만큼의 최신 아이템만 로드한다.
        const itemsToLoad = isFixedSize ? normalized.slice(Math.max(0, normalized.length - capacity)) : normalized;

        for (const item of itemsToLoad) {
            push(item); // push 로직을 사용하여 용량 및 덮어쓰기 처리
        }
    };

    return {
        push,
        peek,
        shift,
        clear,
        size: () => length,
        toArray,
        load,
    };
};
