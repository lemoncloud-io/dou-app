/**
 * Tests for the WebSocket Worker message queue logic.
 * Simulates the Worker's internal logic to verify queue behavior.
 */
describe('WebSocket Worker Message Queue', () => {
    const MAX_QUEUE_SIZE = 100;
    let messageQueue: string[];

    beforeEach(() => {
        messageQueue = [];
    });

    const queueMessage = (data: object) => {
        const jsonData = JSON.stringify(data);
        if (messageQueue.length < MAX_QUEUE_SIZE) {
            messageQueue.push(jsonData);
        } else {
            messageQueue.shift();
            messageQueue.push(jsonData);
        }
    };

    const flushQueue = (sendFn: (msg: string) => void) => {
        const queue = messageQueue;
        messageQueue = [];
        queue.forEach(msg => sendFn(msg));
    };

    it('오프라인 시 메시지가 큐에 저장된다', () => {
        queueMessage({ type: 'chat', action: 'send', payload: { text: 'hello' } });
        queueMessage({ type: 'chat', action: 'send', payload: { text: 'world' } });

        expect(messageQueue).toHaveLength(2);
    });

    it('큐가 MAX_QUEUE_SIZE를 초과하면 가장 오래된 메시지를 드롭한다', () => {
        for (let i = 0; i < 105; i++) {
            queueMessage({ id: i });
        }

        expect(messageQueue).toHaveLength(100);

        // The first message is id: 5 (0-4 were dropped)
        const first = JSON.parse(messageQueue[0]);
        expect(first.id).toBe(5);

        // The last message is id: 104
        const last = JSON.parse(messageQueue[99]);
        expect(last.id).toBe(104);
    });

    it('flush 시 모든 메시지가 순서대로 전송된다', () => {
        const sent: string[] = [];

        queueMessage({ text: 'first' });
        queueMessage({ text: 'second' });
        queueMessage({ text: 'third' });

        flushQueue(msg => sent.push(msg));

        expect(sent).toHaveLength(3);
        expect(JSON.parse(sent[0]).text).toBe('first');
        expect(JSON.parse(sent[1]).text).toBe('second');
        expect(JSON.parse(sent[2]).text).toBe('third');

        // The queue is empty after flush
        expect(messageQueue).toHaveLength(0);
    });

    it('flush 후 새 메시지는 새 큐에 쌓인다', () => {
        queueMessage({ text: 'before-flush' });
        // eslint-disable-next-line @typescript-eslint/no-empty-function
        flushQueue(() => {});

        queueMessage({ text: 'after-flush' });
        expect(messageQueue).toHaveLength(1);
        expect(JSON.parse(messageQueue[0]).text).toBe('after-flush');
    });
});
