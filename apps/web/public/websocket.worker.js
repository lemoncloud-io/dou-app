let ws = null;
let pingInterval = null;
let connectionId = null;
let reconnectTimeout = null;
let isManualDisconnect = false;
let currentConfig = null;
let reconnectAttempts = 0;
let pongTimeout = null;
let pingCount = 0;
let pongCount = 0;

const startPingPong = interval => {
    if (pingInterval) clearInterval(pingInterval);

    pingInterval = setInterval(() => {
        if (ws?.readyState === 1) {
            pingCount++;
            ws.send(JSON.stringify({ action: 'ping', data: { timestamp: Date.now() } }));
            self.postMessage({ type: 'log', message: 'Sent ping' });
            self.postMessage({ type: 'stats', pingCount, pongCount });

            if (pongTimeout) clearTimeout(pongTimeout);
            pongTimeout = setTimeout(() => {
                self.postMessage({ type: 'log', message: 'Pong timeout, forcing reconnect' });
                ws?.close();
            }, 5000);
        }
    }, interval);
};

const stopPingPong = () => {
    if (pingInterval) {
        clearInterval(pingInterval);
        pingInterval = null;
    }
    if (pongTimeout) {
        clearTimeout(pongTimeout);
        pongTimeout = null;
    }
    pingCount = 0;
    pongCount = 0;
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
        reconnectAttempts = 0;
        self.postMessage({ type: 'status', status: 'connected' });
        self.postMessage({ type: 'log', message: 'Connected' });

        setTimeout(() => {
            if (ws?.readyState === 1) {
                ws.send(JSON.stringify({ action: 'info', data: {} }));
            }
        }, 100);

        startPingPong(interval);
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
                ws?.send(JSON.stringify({ action: 'pong', data: { timestamp: Date.now() } }));
                self.postMessage({ type: 'log', message: 'Received ping, sent pong' });
                self.postMessage({ type: 'message', data });
                return;
            }

            if (data.action === 'pong') {
                if (pongTimeout) clearTimeout(pongTimeout);
                pongCount++;
                self.postMessage({ type: 'log', message: 'Received pong' });
                self.postMessage({ type: 'stats', pingCount, pongCount });
                self.postMessage({ type: 'message', data });
                return;
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

self.onmessage = e => {
    const { type, config, data } = e.data;

    switch (type) {
        case 'connect':
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
                const jsonData = JSON.stringify(data);
                ws.send(jsonData);

                // Track manual ping
                if (data && typeof data === 'object' && data.action === 'ping') {
                    pingCount++;
                    self.postMessage({ type: 'stats', pingCount, pongCount });
                }

                self.postMessage({ type: 'log', message: 'Sent: ' + jsonData });
            } else {
                self.postMessage({ type: 'log', message: 'Cannot send - not connected' });
            }
            break;
    }
};
