/**
 * `components/memberships/MembershipFilterRail.tsx`
 * - The left column: every filter, grouped by whether the server or the browser applies it.
 *
 * The grouping is the point of the layout, the same as the log console's rail. Here it carries an
 * awkward fact: **the relay applies none of them.** `GET /memberships/0/list` maps a field into its
 * search model only when `hasAdmin` is set, and the list route calls its transformer without —
 * so `status`, `platform`, `userId`, `productId` and `isSuper` are accepted and silently ignored.
 *
 * They are still sent, so the screen starts narrowing server-side the moment that is fixed, and
 * they are applied here in the meantime. The rail says which is happening rather than letting an
 * operator read "3건" and believe it came from the whole table.
 *
 * The text fields hold their own state and settle into the URL on a delay: without it every
 * keystroke writes a URL and re-runs the query.
 */
import { useEffect, useState } from 'react';

import { useDebounce } from '@chatic/shared';

import type { FilterValues } from '../lib/filters';

interface MembershipFilterRailProps {
    values: FilterValues;
    onChange: (patch: Record<string, string>) => void;
    /** Rows the browser-side filters are working over, for the group's caption. */
    pageSize: number;
}

const STATUSES = ['', 'active', 'canceled', 'expired', 'none'];
const PLATFORMS = ['', 'apple-inapp', 'google-inapp'];

const selectClass =
    'h-8 w-full rounded-md border border-input bg-background px-2 text-xs text-foreground outline-none focus:border-ring';
const inputClass = `${selectClass} placeholder:text-muted-foreground/60`;
const labelClass = 'text-[10px] uppercase tracking-wider text-muted-foreground';

export const MembershipFilterRail = ({ values, onChange, pageSize }: MembershipFilterRailProps) => {
    const [userIdDraft, setUserIdDraft] = useState(values.userId ?? '');
    const [productDraft, setProductDraft] = useState(values.productId ?? '');
    const settledUserId = useDebounce(userIdDraft, 300);
    const settledProduct = useDebounce(productDraft, 300);

    // The drafts own the field; the URL is written only once typing settles.
    useEffect(() => {
        if (settledUserId.trim() !== (values.userId ?? '')) onChange({ userId: settledUserId.trim() });
    }, [settledUserId]);

    useEffect(() => {
        if (settledProduct.trim() !== (values.productId ?? '')) onChange({ productId: settledProduct.trim() });
    }, [settledProduct]);

    // A cleared chip has to reach the field too, or the input keeps showing what was cleared.
    useEffect(() => setUserIdDraft(values.userId ?? ''), [values.userId]);
    useEffect(() => setProductDraft(values.productId ?? ''), [values.productId]);

    return (
        <aside className="flex w-64 shrink-0 flex-col gap-5 overflow-y-auto border-r border-border bg-card px-4 py-4">
            <section className="flex flex-col gap-3">
                <header>
                    <h2 className="text-xs font-semibold text-foreground">필터</h2>
                    <p className="mt-1 text-[11px] leading-snug text-muted-foreground">
                        불러온 <span className="tabular-nums">{pageSize}</span>건 안에서 걸립니다. 서버는 아직 이 축들을
                        무시합니다.
                    </p>
                </header>

                <label className="flex flex-col gap-1">
                    <span className={labelClass}>상태</span>
                    <select
                        className={selectClass}
                        value={values.status ?? ''}
                        onChange={event => onChange({ status: event.target.value })}
                    >
                        {STATUSES.map(value => (
                            <option key={value || 'all'} value={value}>
                                {value || '전체'}
                            </option>
                        ))}
                    </select>
                </label>

                <label className="flex flex-col gap-1">
                    <span className={labelClass}>플랫폼</span>
                    <select
                        className={selectClass}
                        value={values.platform ?? ''}
                        onChange={event => onChange({ platform: event.target.value })}
                    >
                        {PLATFORMS.map(value => (
                            <option key={value || 'all'} value={value}>
                                {value || '전체'}
                            </option>
                        ))}
                    </select>
                </label>

                <label className="flex flex-col gap-1">
                    <span className={labelClass}>userId</span>
                    <input
                        className={inputClass}
                        placeholder="부분 일치"
                        value={userIdDraft}
                        onChange={event => setUserIdDraft(event.target.value)}
                    />
                </label>

                <label className="flex flex-col gap-1">
                    <span className={labelClass}>상품</span>
                    <input
                        className={inputClass}
                        placeholder="pro_tier_01"
                        value={productDraft}
                        onChange={event => setProductDraft(event.target.value)}
                    />
                </label>
            </section>

            <section className="flex flex-col gap-2 border-t border-border pt-4">
                <header>
                    <h2 className="text-xs font-semibold text-foreground">이관 확인</h2>
                    <p className="mt-1 text-[11px] leading-snug text-muted-foreground">
                        `isSuper` 는 폐기된 축입니다. 남아 있는 레코드를 찾는 용도입니다.
                    </p>
                </header>
                <button
                    type="button"
                    onClick={() => onChange({ isSuper: values.isSuper ? '' : '1' })}
                    className={`h-8 rounded-md border px-2 text-xs transition-colors ${
                        values.isSuper
                            ? 'border-ring bg-accent text-foreground'
                            : 'border-input bg-background text-muted-foreground hover:text-foreground'
                    }`}
                >
                    isSuper=1 만 보기
                </button>
            </section>
        </aside>
    );
};
