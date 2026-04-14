/* eslint-disable */
let ws = null;
let connectionId = null;
let reconnectTimeout = null;
let isManualDisconnect = false;
let currentConfig = null;
let reconnectAttempts = 0;
let syncInfoInterval = null;
let syncInfoTimeout = null;
let waitingForSyncInfo = false;

const SYNC_INFO_INTERVAL = 60000; // 60s
const SYNC_INFO_TIMEOUT = 5000; // 5s
const MAX_QUEUE_SIZE = 100;
let messageQueue = [];

const startSyncInfoHeartbeat = () => {
    if (syncInfoInterval) clearInterval(syncInfoInterval);

    syncInfoInterval = setInterval(() => {
        if (ws?.readyState === 1) {
            ws.send(JSON.stringify({ type: 'sync', action: 'info' }));
            self.postMessage({ type: 'log', message: 'Sent sync info heartbeat' });
            waitingForSyncInfo = true;

            if (syncInfoTimeout) clearTimeout(syncInfoTimeout);
            syncInfoTimeout = setTimeout(() => {
                if (waitingForSyncInfo) {
                    self.postMessage({ type: 'log', message: 'Sync info timeout, forcing reconnect' });
                    ws?.close();
                }
            }, SYNC_INFO_TIMEOUT);
        }
    }, SYNC_INFO_INTERVAL);
};

const stopSyncInfoHeartbeat = () => {
    if (syncInfoInterval) {
        clearInterval(syncInfoInterval);
        syncInfoInterval = null;
    }
    if (syncInfoTimeout) {
        clearTimeout(syncInfoTimeout);
        syncInfoTimeout = null;
    }
    waitingForSyncInfo = false;
};

const attemptReconnect = () => {
    if (isManualDisconnect || !currentConfig) return;

    const delay = Math.min(1000 * Math.pow(2, reconnectAttempts), 30000);
    reconnectAttempts++;

    self.postMessage({
        type: 'log',
        message: `Attempting reconnect in ${delay / 1000}s... (attempt ${reconnectAttempts})`,
    });
    reconnectTimeout = setTimeout(() => {
        self.postMessage({ type: 'log', message: 'Reconnecting...' });
        connectWebSocket(currentConfig);
    }, delay);
};

const connectWebSocket = config => {
    const { endpoint, token, authQueryParam, deviceId, channels, auth } = config;

    // Require deviceId for connection
    if (!deviceId) {
        self.postMessage({ type: 'log', message: 'DeviceId required for connection, skipping' });
        self.postMessage({ type: 'status', status: 'error' });
        return;
    }

    if (ws?.readyState === 1 || ws?.readyState === 0) {
        self.postMessage({ type: 'log', message: 'Already connected or connecting' });
        return;
    }

    if (ws) {
        ws.close();
        ws = null;
    }

    const params = [];
    if (token && authQueryParam) {
        params.push(authQueryParam + '=' + token);
    }
    if (deviceId) {
        params.push('deviceId=' + deviceId);
    }
    if (channels) {
        params.push('channels=' + channels);
    }
    if (auth) {
        params.push('auth=true');
    }

    const wsUrl = endpoint + (params.length > 0 ? '?' + params.join('&') : '');

    self.postMessage({ type: 'status', status: 'connecting' });
    self.postMessage({ type: 'log', message: 'Connecting to: ' + wsUrl });

    ws = new WebSocket(wsUrl);

    ws.onopen = () => {
        reconnectAttempts = 0;
        self.postMessage({ type: 'status', status: 'connected' });
        self.postMessage({ type: 'log', message: 'Connected' });

        // Flush queued messages
        if (messageQueue.length > 0) {
            self.postMessage({ type: 'log', message: 'Flushing ' + messageQueue.length + ' queued messages' });
            const queue = messageQueue;
            messageQueue = [];
            queue.forEach(msg => {
                if (ws?.readyState === 1) {
                    ws.send(msg);
                }
            });
        }

        startSyncInfoHeartbeat();
    };

    ws.onmessage = event => {
        try {
            const data = JSON.parse(event.data);

            if (data.action === 'info' && data.data?.id) {
                connectionId = data.data.connectionId || null;
                self.postMessage({
                    type: 'connectionId',
                    id: data.data.id,
                    connectionId,
                });
                return;
            }

            if (data.action === 'ping') {
                ws?.send(JSON.stringify({ type: 'system', action: 'pong', data: { timestamp: Date.now() } }));
                self.postMessage({ type: 'log', message: 'Received ping, sent pong' });
                self.postMessage({ type: 'message', data });
                return;
            }

            if (data.type === 'sync' && data.action === 'info') {
                if (syncInfoTimeout) clearTimeout(syncInfoTimeout);
                waitingForSyncInfo = false;
                self.postMessage({ type: 'log', message: 'Received sync info response' });
            }

            self.postMessage({ type: 'message', data });
        } catch (error) {
            self.postMessage({ type: 'error', error: 'Failed to parse message' });
        }
    };

    ws.onclose = event => {
        self.postMessage({
            type: 'log',
            message: 'Disconnected: ' + event.code + ' ' + event.reason,
        });
        stopSyncInfoHeartbeat();
        self.postMessage({ type: 'status', status: 'disconnected' });

        if (!isManualDisconnect) {
            attemptReconnect();
        }
    };

    ws.onerror = () => {
        self.postMessage({ type: 'error', error: 'WebSocket error' });
        self.postMessage({ type: 'status', status: 'error' });
    };
};

self.onmessage = e => {
    const { type, config, data } = e.data;

    switch (type) {
        case 'connect':
            self.postMessage({ type: 'log', message: 'Connect config: ' + JSON.stringify(config) });
            isManualDisconnect = false;
            reconnectAttempts = 0;
            currentConfig = config;
            if (reconnectTimeout) {
                clearTimeout(reconnectTimeout);
                reconnectTimeout = null;
            }
            connectWebSocket(config);
            break;

        case 'disconnect':
            isManualDisconnect = true;
            if (reconnectTimeout) {
                clearTimeout(reconnectTimeout);
                reconnectTimeout = null;
            }
            stopSyncInfoHeartbeat();
            messageQueue = [];
            if (ws) {
                ws.close();
                ws = null;
            }
            connectionId = null;
            currentConfig = null;
            self.postMessage({ type: 'status', status: 'disconnected' });
            break;

        case 'send':
            if (ws?.readyState === 1) {
                const jsonData = JSON.stringify(data);
                ws.send(jsonData);
                self.postMessage({ type: 'log', message: 'Sent: ' + jsonData });
            } else {
                // Queue message for delivery after reconnection
                const jsonData = JSON.stringify(data);
                if (messageQueue.length < MAX_QUEUE_SIZE) {
                    messageQueue.push(jsonData);
                    self.postMessage({
                        type: 'log',
                        message: 'Queued message (' + messageQueue.length + '/' + MAX_QUEUE_SIZE + ')',
                    });
                } else {
                    self.postMessage({ type: 'log', message: 'Message queue full, dropping oldest message' });
                    messageQueue.shift();
                    messageQueue.push(jsonData);
                }
            }
            break;
    }
};
