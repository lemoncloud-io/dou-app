import type {
    BaseWebSocketMessage,
    ConnectionIdCallback,
    ErrorCallback,
    MessageCallback,
    StatusCallback,
    WebSocketServiceConfig,
} from '../types';

/**
 * Generic WebSocket service class
 * Handles connection lifecycle, ping/pong, and message routing
 *
 * @typeParam TMessage - Message type that extends BaseWebSocketMessage
 *
 * @example
 * ```typescript
 * const service = new WebSocketService<MyMessage>({
 *   endpoint: 'wss://api.example.com/ws',
 *   token: 'auth-token',
 *   logPrefix: '[MyWS]'
 * });
 *
 * service.setMessageParser((data) => {
 *   // Custom parsing logic
 *   return data as MyMessage;
 * });
 *
 * service.onMessage((msg) => console.log(msg));
 * service.connect();
 * ```
 */
export class WebSocketService<TMessage extends BaseWebSocketMessage = BaseWebSocketMessage> {
    private ws: WebSocket | null = null;
    private connectionId: string | null = null;
    private pingInterval: NodeJS.Timeout | null = null;
    private isManualDisconnect = false;
    /**
     * Track error state to prevent status override in handleClose
     * Reset on new connection attempt and manual disconnect
     */
    private hasError = false;
    private config: Required<WebSocketServiceConfig>;

    // Callbacks
    private messageCallback: MessageCallback<TMessage> | null = null;
    private statusCallback: StatusCallback | null = null;
    private connectionIdCallback: ConnectionIdCallback | null = null;
    private errorCallback: ErrorCallback | null = null;

    // Custom message parser (optional)
    private messageParser: ((data: unknown) => TMessage | null) | null = null;

    /**
     * Create WebSocket service instance
     * @param config - Service configuration
     */
    constructor(config: Partial<WebSocketServiceConfig> = {}) {
        this.config = {
            endpoint: config.endpoint || '',
            token: config.token || '',
            authQueryParam: config.authQueryParam || 'x-lemon-identity',
            pingInterval: config.pingInterval || 180000, // 3 minutes
            logPrefix: config.logPrefix || '[WebSocket]',
            requestConnectionId: config.requestConnectionId ?? true,
            sessionId: config.sessionId || '',
        };
    }

    /**
     * Set custom message parser function
     * Parser should return parsed message or null if message should be ignored
     *
     * @param parser - Function to parse raw WebSocket data into typed messages
     */
    setMessageParser(parser: (data: unknown) => TMessage | null): void {
        this.messageParser = parser;
    }

    /**
     * Connect to WebSocket endpoint
     * Uses token from constructor config
     */
    connect(): void {
        // Prevent duplicate connections (important for React StrictMode)
        if (this.ws?.readyState === WebSocket.OPEN) {
            console.warn(`${this.config.logPrefix} Already connected`);
            return;
        }

        if (this.ws?.readyState === WebSocket.CONNECTING) {
            console.warn(`${this.config.logPrefix} Connection already in progress`);
            return;
        }

        if (!this.config.endpoint) {
            console.error(`${this.config.logPrefix} Endpoint not configured`);
            return;
        }

        if (!this.config.token) {
            console.error(`${this.config.logPrefix} Token not provided`);
            return;
        }

        this.isManualDisconnect = false;
        this.hasError = false;

        // Build WebSocket URL with authentication query parameter
        let wsUrl = `${this.config.endpoint}?${this.config.authQueryParam}=${this.config.token}&default=&info=`;
        if (this.config.sessionId) {
            wsUrl += `&id=${this.config.sessionId}`;
        }

        console.log(`${this.config.logPrefix} Connecting to:`, this.config.endpoint);
        console.log(`${this.config.logPrefix} Session ID:`, this.config.sessionId);
        console.log(`${this.config.logPrefix} Full URL:`, wsUrl);

        try {
            this.statusCallback?.('connecting');
            this.ws = new WebSocket(wsUrl);

            this.ws.onopen = this.handleOpen.bind(this);
            this.ws.onmessage = this.handleMessage.bind(this);
            this.ws.onclose = this.handleClose.bind(this);
            this.ws.onerror = this.handleError.bind(this);
        } catch (error) {
            console.error(`${this.config.logPrefix} Connection failed:`, error);
            this.hasError = true;
            this.statusCallback?.('error');
            this.errorCallback?.(error as Error);
        }
    }

    /**
     * Update configuration and reconnect if needed
     * @param config - Partial configuration to update
     */
    updateConfig(config: Partial<WebSocketServiceConfig>): void {
        const wasConnected = this.isConnected();

        this.config = {
            ...this.config,
            ...config,
            authQueryParam: config.authQueryParam || this.config.authQueryParam,
            pingInterval: config.pingInterval || this.config.pingInterval,
            logPrefix: config.logPrefix || this.config.logPrefix,
            requestConnectionId: config.requestConnectionId ?? this.config.requestConnectionId,
            sessionId: config.sessionId || this.config.sessionId,
        };

        if (wasConnected) {
            this.disconnect();
            this.connect();
        }
    }

    /**
     * Disconnect from WebSocket
     */
    disconnect(): void {
        this.isManualDisconnect = true;
        this.hasError = false;
        this.stopPingPong();

        if (this.ws) {
            this.ws.close();
            this.ws = null;
        }

        this.connectionId = null;
        this.statusCallback?.('disconnected');
    }

    /**
     * Register message callback
     * @param callback - Function called when typed message is received
     */
    onMessage(callback: MessageCallback<TMessage>): void {
        this.messageCallback = callback;
    }

    /**
     * Register connection status callback
     * @param callback - Function called when connection status changes
     */
    onConnectionStatus(callback: StatusCallback): void {
        this.statusCallback = callback;
    }

    /**
     * Register connection ID callback
     * @param callback - Function called when connection ID is received
     */
    onConnectionId(callback: ConnectionIdCallback): void {
        this.connectionIdCallback = callback;
    }

    /**
     * Register error callback
     * @param callback - Function called when error occurs
     */
    onError(callback: ErrorCallback): void {
        this.errorCallback = callback;
    }

    /**
     * Get current connection ID
     * @returns Connection ID or null if not connected
     */
    getConnectionId(): string | null {
        return this.connectionId;
    }

    /**
     * Check if currently connected
     * @returns True if WebSocket is open
     */
    isConnected(): boolean {
        return this.ws?.readyState === WebSocket.OPEN;
    }

    // Private methods

    private handleOpen(): void {
        console.log(`${this.config.logPrefix} Connected`);
        this.statusCallback?.('connected');

        if (this.config.requestConnectionId) {
            this.requestConnectionId();
        }

        this.startPingPong();
    }

    private handleMessage(event: MessageEvent): void {
        try {
            const data = JSON.parse(event.data) as Record<string, unknown>;

            // Handle connection ID response
            if (data.action === 'info' && data.data && typeof data.data === 'object') {
                const infoData = data.data as Record<string, unknown>;
                if (infoData.id) {
                    const id = infoData.id as string;
                    const connId = typeof infoData.connectionId === 'string' ? infoData.connectionId : null;
                    this.connectionId = connId;
                    console.log(`${this.config.logPrefix} ID:`, id);
                    console.log(`${this.config.logPrefix} Connection ID:`, this.connectionId);
                    this.connectionIdCallback?.(id, connId);
                    return;
                }
            }

            // Handle ping/pong
            if (data.action === 'ping') {
                this.sendPong();
                return;
            }

            if (data.action === 'pong') {
                // Ignore pong response
                return;
            }

            // Parse custom message if parser provided
            if (this.messageParser) {
                const parsedMessage = this.messageParser(data);
                if (parsedMessage) {
                    console.log(`${this.config.logPrefix} Message:`, parsedMessage);
                    this.messageCallback?.(parsedMessage);
                }
                return;
            }

            // Fallback: pass raw data as BaseWebSocketMessage
            this.messageCallback?.(data as TMessage);
        } catch (error) {
            console.error(`${this.config.logPrefix} Failed to parse message:`, error);
            this.errorCallback?.(new Error('Invalid message format'));
        }
    }

    private handleClose(event: CloseEvent): void {
        console.log(`${this.config.logPrefix} Disconnected`, event.code, event.reason);
        this.stopPingPong();

        // Only change status to 'disconnected' if there was no error
        // If there was an error, keep the 'error' status
        if (!this.hasError) {
            this.statusCallback?.('disconnected');
        }

        // Don't reconnect if manual disconnect
        if (this.isManualDisconnect) {
            return;
        }

        // Auto-reconnect logic could go here if needed
        // For now, leave reconnection to the component/hook layer
    }

    private handleError(event: Event): void {
        console.error(`${this.config.logPrefix} Error:`, event);
        this.hasError = true;
        this.statusCallback?.('error');
        this.errorCallback?.(new Error('WebSocket error'));
    }

    private requestConnectionId(): void {
        if (this.ws?.readyState === WebSocket.OPEN) {
            this.ws.send(
                JSON.stringify({
                    action: 'info',
                    data: {},
                })
            );
        }
    }

    private startPingPong(): void {
        // Send ping at configured interval
        this.pingInterval = setInterval(() => {
            if (this.ws?.readyState === WebSocket.OPEN) {
                this.ws.send(
                    JSON.stringify({
                        action: 'ping',
                        data: { timestamp: Date.now() },
                    })
                );
            }
        }, this.config.pingInterval);
    }

    private stopPingPong(): void {
        if (this.pingInterval) {
            clearInterval(this.pingInterval);
            this.pingInterval = null;
        }
    }

    private sendPong(): void {
        if (this.ws?.readyState === WebSocket.OPEN) {
            this.ws.send(
                JSON.stringify({
                    action: 'pong',
                    data: { timestamp: Date.now() },
                })
            );
        }
    }
}
