/**
 * Top-level base spec shared by every message used in bridge communication.
 */
export type BaseMessage = {
    refId?: string;
    version?: string;
    nonce?: string;
};
