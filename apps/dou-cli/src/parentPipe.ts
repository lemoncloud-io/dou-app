export const PARENT_PIPE_FLAG = '--parent-pipe';

export const watchParentPipe = (stdin: NodeJS.ReadableStream, onClose: () => void): void => {
    let closed = false;
    const close = (): void => {
        if (closed) return;
        closed = true;
        onClose();
    };
    stdin.on('end', close);
    stdin.on('close', close);
    stdin.on('error', close);
    stdin.resume();
};
