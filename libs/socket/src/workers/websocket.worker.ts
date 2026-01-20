 

interface WorkerConfig {
    endpoint: string;
    token: string;
    authQueryParam: string;
    pingInterval: number;
    sessionId?: string;
}

let ws: WebSocket | null = null;
let pingInterval: ReturnType<typeof setInterval> | null = null;
let connectionId: string | null = null;

const startPingPong = (interval: number) => {
    if (pingInterval) clearInterval(pingInterval);

    pingInterval = setInterval(() => {
        if (ws?.readyState === WebSocket.OPEN) {
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

self.onmessage = (e: MessageEvent) => {
    const { type, config, data } = e.data;

    switch (type) {
        case 'connect': {
            const { endpoint, token, authQueryParam, pingInterval: interval, sessionId } = config as WorkerConfig;

            if (ws?.readyState === WebSocket.OPEN) {
                self.postMessage({ type: 'log', message: 'Already connected' });
                return;
            }

            let wsUrl = `${endpoint}?${authQueryParam}=${token}&default=&info=`;
            if (sessionId) {
                wsUrl += `&deviceId=${sessionId}`;
            }

            self.postMessage({ type: 'status', status: 'connecting' });
            self.postMessage({ type: 'log', message: `Connecting to: ${endpoint}` });

            ws = new WebSocket(wsUrl);

            ws.onopen = () => {
                self.postMessage({ type: 'status', status: 'connected' });
                self.postMessage({ type: 'log', message: 'Connected' });

                // Request connection ID
                ws?.send(JSON.stringify({ action: 'info', data: {} }));

                startPingPong(interval);
            };

            ws.onmessage = (event: MessageEvent) => {
                try {
                    const data = JSON.parse(event.data);

                    // Handle connection ID
                    if (data.action === 'info' && data.data?.id) {
                        connectionId = data.data.connectionId || null;
                        self.postMessage({
                            type: 'connectionId',
                            id: data.data.id,
                            connectionId,
                        });
                        return;
                    }

                    // Handle ping
                    if (data.action === 'ping') {
                        ws?.send(JSON.stringify({ action: 'pong', data: { timestamp: Date.now() } }));
                        self.postMessage({ type: 'log', message: 'Received ping, sent pong' });
                        return;
                    }

                    // Handle pong
                    if (data.action === 'pong') {
                        self.postMessage({ type: 'log', message: 'Received pong' });
                        return;
                    }

                    // Forward message to main thread
                    self.postMessage({ type: 'message', data });
                } catch (_error) {
                    self.postMessage({ type: 'error', error: 'Failed to parse message' });
                }
            };

            ws.onclose = (event: CloseEvent) => {
                self.postMessage({
                    type: 'log',
                    message: `Disconnected: ${event.code} ${event.reason}`,
                });
                stopPingPong();
                self.postMessage({ type: 'status', status: 'disconnected' });
            };

            ws.onerror = () => {
                self.postMessage({ type: 'error', error: 'WebSocket error' });
                self.postMessage({ type: 'status', status: 'error' });
            };
            break;
        }

        case 'disconnect':
            stopPingPong();
            if (ws) {
                ws.close();
                ws = null;
            }
            connectionId = null;
            self.postMessage({ type: 'status', status: 'disconnected' });
            break;

        case 'send':
            if (ws?.readyState === WebSocket.OPEN) {
                ws.send(JSON.stringify(data));
                self.postMessage({ type: 'log', message: `Sent: ${JSON.stringify(data)}` });
            } else {
                self.postMessage({ type: 'log', message: 'Cannot send - not connected' });
            }
            break;
    }
};
