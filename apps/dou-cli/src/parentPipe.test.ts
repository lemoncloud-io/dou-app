import { PassThrough } from 'node:stream';

import { watchParentPipe } from './parentPipe';

describe('watchParentPipe', () => {
    it('calls back once when the parent closes the pipe', () => {
        const stdin = new PassThrough();
        const onClose = jest.fn();
        watchParentPipe(stdin, onClose);
        stdin.write('ignored');
        expect(onClose).not.toHaveBeenCalled();
        stdin.end();
        stdin.destroy();
        return new Promise<void>(resolve => setImmediate(resolve)).then(() => expect(onClose).toHaveBeenCalledTimes(1));
    });

    it('calls back when the pipe fails', () => {
        const stdin = new PassThrough();
        const onClose = jest.fn();
        watchParentPipe(stdin, onClose);
        stdin.emit('error', new Error('broken pipe'));
        expect(onClose).toHaveBeenCalledTimes(1);
    });
});
