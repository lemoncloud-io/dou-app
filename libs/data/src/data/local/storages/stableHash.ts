/**
 * options를 sorted-key JSON으로 직렬화한 string을 반환합니다.
 * Stampede 가드의 query key 생성에 사용합니다.
 *
 * - 객체의 키를 정렬 후 JSON 직렬화 → 순서 무관 동치성 보장
 * - undefined 필드는 정렬 전에 제거 (missing key와 동치화)
 * - MVP: sorted-key JSON 그 자체를 key로 사용
 */
export function stableHash(value: unknown): string {
    return JSON.stringify(sortKeys(value));
}

function sortKeys(value: unknown): unknown {
    if (value === null || value === undefined) return value;
    if (Array.isArray(value)) return value.map(sortKeys);
    if (typeof value === 'object') {
        const sorted: Record<string, unknown> = {};
        for (const key of Object.keys(value as Record<string, unknown>).sort()) {
            const v = (value as Record<string, unknown>)[key];
            if (v !== undefined) {
                sorted[key] = sortKeys(v);
            }
        }
        return sorted;
    }
    return value;
}
