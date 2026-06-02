/** [요청] 네이티브 클립보드에 텍스트 쓰기 */
export type CopyToClipboardPayload = {
    /** 클립보드에 복사할 텍스트 */
    text: string;
};

/** [응답] 네이티브 클립보드 쓰기 결과 */
export type OnCopyToClipboardPayload = {
    copied: boolean;
};
