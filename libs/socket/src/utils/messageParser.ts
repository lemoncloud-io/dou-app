import type { WebSocketMessage } from '../stores/useWebSocketStore';

/**
 * Type guard to check if value is a non-null object
 */
export const isObject = (value: unknown): value is Record<string, unknown> =>
    typeof value === 'object' && value !== null;

/**
 * Safely extract string value from object
 */
export const getStringValue = (obj: Record<string, unknown>, key: string): string | undefined => {
    const value = obj[key];
    return typeof value === 'string' ? value : undefined;
};

/**
 * Parse raw WebSocket message data into generic WebSocketMessage
 * For pointer messages, uses 'type' as fallback ID since position messages don't have id/mid
 */
export const parsePointerWebSocketMessage = (data: unknown): WebSocketMessage | null => {
    if (!isObject(data)) {
        return null;
    }

    const payload =
        'action' in data && data['action'] === 'message' && 'data' in data && isObject(data['data'])
            ? data['data']
            : data;

    // Try to get messageId from id, mid, or fallback to type for routing
    const messageId =
        getStringValue(payload, 'id') ?? getStringValue(payload, 'mid') ?? getStringValue(payload, 'type') ?? 'unknown';

    return {
        id: messageId,
        data: payload,
    };
};
