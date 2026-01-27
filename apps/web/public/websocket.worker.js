/* eslint-disable */
let ws = null;
let connectionId = null;
let reconnectTimeout = null;
let isManualDisconnect = false;
let currentConfig = null;
let reconnectAttempts = 0;

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
    const { endpoint, token, authQueryParam, sessionId, channels } = config;

    if (ws?.readyState === 1 || ws?.readyState === 0) {
        self.postMessage({ type: 'log', message: 'Already connected or connecting' });
        return;
    }

    if (ws) {
        ws.close();
        ws = null;
    }

    // channels가 지정되면 default 파라미터를 제외 (default가 있으면 기본 채널 0000으로 연결됨)
    let wsUrl = endpoint + '?' + authQueryParam + '=' + token;
    if (!channels) {
        wsUrl += '&default=';
    }
    wsUrl += '&info=';
    if (sessionId) {
        wsUrl += '&deviceId=' + sessionId;
    }
    if (channels) {
        wsUrl += '&channels=' + channels;
    }

    self.postMessage({ type: 'status', status: 'connecting' });
    self.postMessage({ type: 'log', message: 'Connecting to: ' + wsUrl });

    ws = new WebSocket(wsUrl);

    ws.onopen = () => {
        reconnectAttempts = 0;
        self.postMessage({ type: 'status', status: 'connected' });
        self.postMessage({ type: 'log', message: 'Connected' });

        setTimeout(() => {
            if (ws?.readyState === 1) {
                ws.send(JSON.stringify({ type: 'system', action: 'info', data: {} }));
            }
        }, 100);
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
                self.postMessage({ type: 'log', message: 'Cannot send - not connected' });
            }
            break;
    }
};
