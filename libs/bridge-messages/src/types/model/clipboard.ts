/** [Request] Write text to the native clipboard */
export type CopyToClipboardPayload = {
    /** Text to copy to the clipboard */
    text: string;
};

/** [Response] Result of writing to the native clipboard */
export type OnCopyToClipboardPayload = {
    copied: boolean;
};
