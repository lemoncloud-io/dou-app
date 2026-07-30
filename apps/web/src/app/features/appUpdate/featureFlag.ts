/**
 * Temporary kill switch for the app-update-check feature (update prompt popup +
 * MyPage's "버전 · 업데이트 필요" row). Flip back to `true` to re-enable — no other
 * code changes needed, both call sites read this flag.
 */
export const IS_APP_UPDATE_CHECK_ENABLED = false;
