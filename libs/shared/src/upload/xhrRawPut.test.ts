import { createXhrRawPut, xhrRawPut } from './xhrRawPut';

interface FakeXhr {
    timeout?: number;
    ontimeout?: () => void;
    onabort?: () => void;
    abort: jest.Mock;
    upload: { onprogress?: (event: { lengthComputable: boolean; loaded: number; total: number }) => void };
    status: number;
    responseText: string;
    onload?: () => void;
    onerror?: () => void;
    open: jest.Mock;
    setRequestHeader: jest.Mock;
    send: jest.Mock;
}

let xhr: FakeXhr;

const install = (behave: (instance: FakeXhr) => void) => {
    xhr = {
        upload: {},
        status: 200,
        responseText: '',
        open: jest.fn(),
        abort: jest.fn(),
        setRequestHeader: jest.fn(),
        send: jest.fn(() => behave(xhr)),
    };
    (globalThis as unknown as { XMLHttpRequest: unknown }).XMLHttpRequest = jest.fn(() => xhr);
};

const headerNames = () => xhr.setRequestHeader.mock.calls.map(([name]) => name);

describe('xhrRawPut', () => {
    it('PUTs to the url and reports the status', async () => {
        install(instance => {
            instance.status = 200;
            instance.onload?.();
        });

        await expect(xhrRawPut('https://s3.test/key?sig', {}, new Uint8Array([1]))).resolves.toEqual({
            status: 200,
            code: undefined,
        });
        expect(xhr.open).toHaveBeenCalledWith('PUT', 'https://s3.test/key?sig');
    });

    // The signature covers `content-length`, but the user agent owns that header: setting it throws
    // or is ignored. Dropping it still verifies, because what the browser sends is what was signed.
    it('sends every signed header except the ones the user agent owns', async () => {
        install(instance => instance.onload?.());

        await xhrRawPut(
            'https://s3.test/key',
            {
                'content-type': 'image/png',
                'Content-Length': '1024',
                host: 's3.test',
                'x-amz-checksum-sha256': 'abc=',
            },
            new Uint8Array([1])
        );

        expect(headerNames()).toEqual(['content-type', 'x-amz-checksum-sha256']);
    });

    it('parses the S3 error code out of a failure body', async () => {
        install(instance => {
            instance.status = 403;
            instance.responseText = '<Error><Code>SignatureDoesNotMatch</Code></Error>';
            instance.onload?.();
        });

        await expect(xhrRawPut('https://s3.test/key', {}, new Uint8Array([1]))).resolves.toEqual({
            status: 403,
            code: 'SignatureDoesNotMatch',
        });
    });

    // A transport failure is one slot's problem. Rejecting here would take the whole batch down.
    it('resolves with status 0 instead of rejecting when the request never lands', async () => {
        install(instance => instance.onerror?.());

        await expect(xhrRawPut('https://s3.test/key', {}, new Uint8Array([1]))).resolves.toEqual({ status: 0 });
    });

    it('forwards upload progress, and only when it is measurable', async () => {
        const onProgress = jest.fn();
        install(instance => {
            instance.upload.onprogress?.({ lengthComputable: false, loaded: 10, total: 0 });
            instance.upload.onprogress?.({ lengthComputable: true, loaded: 512, total: 1024 });
            instance.onload?.();
        });

        await xhrRawPut('https://s3.test/key', {}, new Uint8Array([1]), onProgress);

        expect(onProgress).toHaveBeenCalledTimes(1);
        expect(onProgress).toHaveBeenCalledWith(512, 1024);
    });
});

describe('xhrRawPut — it always settles', () => {
    // A socket that opens and goes quiet would otherwise strand the batch, and the tray with it.
    it('gives up after the silence ceiling', async () => {
        install(instance => instance.ontimeout?.());

        await expect(xhrRawPut('https://s3.test/key', {}, new Uint8Array([1]))).resolves.toEqual({ status: 0 });
        expect(xhr.timeout).toBeGreaterThan(0);
    });

    it('a cancelled batch resolves rather than hanging, and aborts the request', async () => {
        const controller = new AbortController();
        install(() => controller.abort());

        const put = createXhrRawPut({ signal: controller.signal });

        await expect(put('https://s3.test/key', {}, new Uint8Array([1]))).resolves.toEqual({ status: 0 });
        expect(xhr.abort).toHaveBeenCalled();
    });

    it('refuses to start once the batch is already cancelled', async () => {
        const controller = new AbortController();
        controller.abort();
        install(instance => instance.onload?.());

        const put = createXhrRawPut({ signal: controller.signal });

        await expect(put('https://s3.test/key', {}, new Uint8Array([1]))).resolves.toEqual({ status: 0 });
        expect(xhr.send).not.toHaveBeenCalled();
    });

    it('resolves once even when the transport reports twice', async () => {
        install(instance => {
            instance.status = 200;
            instance.onload?.();
            instance.onerror?.();
        });

        await expect(xhrRawPut('https://s3.test/key', {}, new Uint8Array([1]))).resolves.toEqual({
            status: 200,
            code: undefined,
        });
    });
});
