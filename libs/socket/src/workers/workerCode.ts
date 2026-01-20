export const workerCode = `
let ws = null;
let pingInterval = null;
let connectionId = null;
let reconnectTimeout = null;
let isManualDisconnect = false;
let currentConfig = null;

const startPingPong = (interval) => {
    if (pingInterval) clearInterval(pingInterval);

    pingInterval = setInterval(() => {
        if (ws?.readyState === 1) {
            ws.send(JSON.stringify({ action: 'ping', data: { timestamp: Date.now() } }));
            self.postMessage({ type: 'log', message: 'Sent ping' });
        }
    }, interval);
};

const stopPingPong = () => {
    if (pingInterval) {
        clearInterval(pingInterval);
        pingInterval = null;
    }
};

const attemptReconnect = () => {
    if (isManualDisconnect || !currentConfig) return;

    self.postMessage({ type: 'log', message: 'Attempting reconnect in 3s...' });
    reconnectTimeout = setTimeout(() => {
        self.postMessage({ type: 'log', message: 'Reconnecting...' });
        connectWebSocket(currentConfig);
    }, 3000);
};

const connectWebSocket = (config) => {
    const { endpoint, token, authQueryParam, pingInterval: interval, sessionId } = config;

    if (ws?.readyState === 1 || ws?.readyState === 0) {
        self.postMessage({ type: 'log', message: 'Already connected or connecting' });
        return;
    }

    if (ws) {
        ws.close();
        ws = null;
    }

    let wsUrl = endpoint + '?' + authQueryParam + '=' + token + '&default=&info=';
    if (sessionId) {
        wsUrl += '&deviceId=' + sessionId;
    }

    self.postMessage({ type: 'status', status: 'connecting' });
    self.postMessage({ type: 'log', message: 'Connecting to: ' + endpoint });

    ws = new WebSocket(wsUrl);

    ws.onopen = () => {
        self.postMessage({ type: 'status', status: 'connected' });
        self.postMessage({ type: 'log', message: 'Connected' });

        setTimeout(() => {
            if (ws?.readyState === 1) {
                ws.send(JSON.stringify({ action: 'info', data: {} }));
            }
        }, 100);

        startPingPong(interval);
    };

    ws.onmessage = (event) => {
        try {
            const data = JSON.parse(event.data);

            if (data.action === 'info' && data.data?.id) {
                connectionId = data.data.connectionId || null;
                self.postMessage({
                    type: 'connectionId',
                    id: data.data.id,
                    connectionId
                });
                return;
            }

            if (data.action === 'ping') {
                ws?.send(JSON.stringify({ action: 'pong', data: { timestamp: Date.now() } }));
                self.postMessage({ type: 'log', message: 'Received ping, sent pong' });
                return;
            }

            if (data.action === 'pong') {
                self.postMessage({ type: 'log', message: 'Received pong' });
                return;
            }

            self.postMessage({ type: 'message', data });
        } catch (error) {
            self.postMessage({ type: 'error', error: 'Failed to parse message' });
        }
    };

    ws.onclose = (event) => {
        self.postMessage({
            type: 'log',
            message: 'Disconnected: ' + event.code + ' ' + event.reason
        });
        stopPingPong();
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

self.onmessage = (e) => {
    const { type, config, data } = e.data;

    switch (type) {
        case 'connect':
            isManualDisconnect = false;
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
            stopPingPong();
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
                ws.send(JSON.stringify(data));
                self.postMessage({ type: 'log', message: 'Sent: ' + JSON.stringify(data) });
            } else {
                self.postMessage({ type: 'log', message: 'Cannot send - not connected' });
            }
            break;
    }
};
`;
