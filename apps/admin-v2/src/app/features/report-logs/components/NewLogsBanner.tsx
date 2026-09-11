/**
 * `components/report-logs/NewLogsBanner.tsx`
 * - Announces newly-arrived rows without pulling them in.
 *
 * The alternative was a polling refresh, and it fails on this screen specifically: the
 * corpus is a multi-page walk, so refreshing it means discarding what was collected and
 * re-walking — losing scroll position, selection, and any facet reading mid-comparison.
 * Making the merge a click keeps the surface still while it is being read (ADR-0083).
 */
interface NewLogsBannerProps {
    /** Arrivals that will actually show up under the current narrowing. */
    count: number;
    /**
     * The probe's page filled up, so `count` is a floor. Accepting re-collects instead of
     * merging — merging would strand the arrivals that did not fit.
     */
    overflowed?: boolean;
    onAccept: () => void;
}

export const NewLogsBanner = ({ count, overflowed = false, onAccept }: NewLogsBannerProps) => {
    // An overflowed window is worth announcing even when nothing matches the current
    // narrowing: there is more out there than the probe could see.
    if (count <= 0 && !overflowed) return null;

    return (
        <button
            type="button"
            onClick={onAccept}
            title={overflowed ? '한 번에 볼 수 있는 양을 넘었습니다 — 누르면 처음부터 다시 수집합니다' : undefined}
            className="flex items-center gap-2 self-start rounded-full border border-primary bg-primary/10 px-3 py-1 text-xs text-primary transition-colors hover:bg-primary/20"
        >
            <span className="inline-block size-1.5 rounded-full bg-primary" aria-hidden />
            {overflowed
                ? `새 로그 ${count.toLocaleString()}건 이상 · 다시 수집`
                : `새 로그 ${count.toLocaleString()}건 · 받기`}
        </button>
    );
};
