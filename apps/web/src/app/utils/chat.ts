// Chat-preview semantics moved to the data layer (ADR-0057): the last-chat fast path needs the
// same judgement when validating native SQL rows and when re-deriving previews in the old-app
// fallback, so the single source of truth lives in @chatic/data and this module re-exports it.
// apps/desktop-web keeps its own copy (shared/utils/chatSort.ts) — the two must not drift.
export {
    compareByChatNo,
    isFeedVisible,
    isNotifiableChat,
    isOwnSystemChat,
    isPreviewableChat,
    pickPreviewChat,
} from '@chatic/data';
