/**
 * Formats a single debug log entry for clipboard copy.
 *
 * Mirrors the on-screen "[HH:MM:SS] message" layout so a pasted log reads the
 * same as what the developer saw. The timestamp is kept so copied lines can be
 * cross-referenced against native device logs when debugging push delivery.
 */
export interface CopyableLog {
    timestamp: string;
    message: string;
}

export const formatLogForCopy = ({ timestamp, message }: CopyableLog): string => {
    return `[${timestamp}] ${message}`;
};
