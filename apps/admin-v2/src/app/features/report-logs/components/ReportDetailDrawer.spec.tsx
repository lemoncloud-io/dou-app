import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import type { ReportLogRow } from '../lib/parseReportLog';
import { ReportDetailDrawer } from './ReportDetailDrawer';

// The drawer is where symbolication actually happens, and the wiring — file
// input -> read -> decode -> re-render — is the part unit tests on the decoder
// cannot reach. The report list sits behind an admin-role gate, so this stands
// in for clicking through it.

// Hand-built map: generated line 1 col 9 -> useMyProfile.ts:1:9, name getMyProfile.
const MAP_JSON = JSON.stringify({
    version: 3,
    sources: ['../../apps/web/src/app/hooks/useMyProfile.ts'],
    names: ['getMyProfile'],
    mappings: 'AAAA,SAASA',
});

const STACK = 'x@https://dou-dev.chatic.io/assets/index-abc.js:1:9';

const row = (stack?: string): ReportLogRow =>
    ({
        id: 'r1',
        type: 'error',
        title: '[web] script-error',
        message: 'boom',
        payload: { message: 'boom', ...(stack ? { stack } : {}) },
        raw: {},
    }) as unknown as ReportLogRow;

/** jsdom's File lacks .text() in some versions; provide it deterministically. */
const mapFile = (name: string, contents = MAP_JSON): File => {
    const file = new File([contents], name, { type: 'application/json' });
    Object.defineProperty(file, 'text', { value: () => Promise.resolve(contents) });
    return file;
};

const pickMap = (file: File) => {
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    Object.defineProperty(input, 'files', { value: [file], configurable: true });
    fireEvent.change(input);
};

describe('ReportDetailDrawer — 스택 심볼리케이션', () => {
    it('스택이 가리키는 번들명을 보여줘 어느 아티팩트인지 알 수 있게 한다', () => {
        render(<ReportDetailDrawer row={row(STACK)} onClose={vi.fn()} />);

        expect(screen.getByText('index-abc.js')).toBeTruthy();
        expect(screen.getByText(STACK)).toBeTruthy();
    });

    it('맵을 고르면 프레임이 원본 파일·심볼로 바뀐다', async () => {
        render(<ReportDetailDrawer row={row(STACK)} onClose={vi.fn()} />);

        pickMap(mapFile('index-abc.js.map'));

        await waitFor(() =>
            expect(screen.getByText('getMyProfile (apps/web/src/app/hooks/useMyProfile.ts:1:9)')).toBeTruthy()
        );
    });

    it('해석 후 원본으로 되돌릴 수 있다', async () => {
        render(<ReportDetailDrawer row={row(STACK)} onClose={vi.fn()} />);
        pickMap(mapFile('index-abc.js.map'));
        await waitFor(() => expect(screen.getByText(/getMyProfile \(apps/)).toBeTruthy());

        fireEvent.click(screen.getByText('원본 보기'));

        expect(screen.getByText(STACK)).toBeTruthy();
    });

    // 다른 빌드의 맵은 실패하지 않고 '그럴듯하지만 틀린' 줄로 풀린다 — 조용히 넘어가면 안 된다.
    it('번들명이 다른 맵은 경고한다', async () => {
        render(<ReportDetailDrawer row={row(STACK)} onClose={vi.fn()} />);

        pickMap(mapFile('index-zzz.js.map'));

        await waitFor(() => expect(screen.getByText(/이름이 다릅니다/)).toBeTruthy());
    });

    it('한 프레임도 풀리지 않으면 다른 빌드일 수 있다고 알린다', async () => {
        const otherBundle = 'x@https://x/assets/index-abc.js:99:1';
        render(<ReportDetailDrawer row={row(otherBundle)} onClose={vi.fn()} />);

        pickMap(mapFile('index-abc.js.map'));

        await waitFor(() => expect(screen.getByText(/어떤 프레임도 풀리지 않았습니다/)).toBeTruthy());
    });

    it('.map이 아닌 파일은 읽기 실패를 알린다', async () => {
        render(<ReportDetailDrawer row={row(STACK)} onClose={vi.fn()} />);

        pickMap(mapFile('notes.txt', 'not json at all'));

        await waitFor(() => expect(screen.getByText(/소스맵을 읽지 못했습니다/)).toBeTruthy());
    });

    // 한 스택이 여러 번들을 걸치면, 한 맵으로 전부 풀어버리는 쪽이 더 위험하다:
    // 줄/열 조회는 어떤 맵으로도 성공하므로 남의 번들 프레임이 엉뚱한 파일로 간다.
    it('여러 번들을 걸친 스택에서는 고른 맵의 번들 프레임만 바꾼다', async () => {
        const stack = [STACK, 'y@https://dou-dev.chatic.io/assets/chunk-zzz.js:1:9'].join('\n');
        render(<ReportDetailDrawer row={row(stack)} onClose={vi.fn()} />);

        pickMap(mapFile('index-abc.js.map'));

        await waitFor(() => expect(screen.getByText(/getMyProfile \(apps/)).toBeTruthy());
        expect(screen.getByText(/chunk-zzz\.js:1:9/)).toBeTruthy();
    });

    it('스택이 없는 리포트(opaque script-error)에는 섹션 자체가 없다', () => {
        render(<ReportDetailDrawer row={row()} onClose={vi.fn()} />);

        expect(screen.queryByText('소스맵 선택')).toBeNull();
    });

    // 감싼 에러의 stack은 감싼 자리를 가리킨다 — 진짜 원인의 프레임은 cause 쪽이라,
    // 그쪽이 안 풀리면 소스맵을 붙여도 정작 알고 싶은 줄을 못 본다.
    it('cause 체인의 프레임도 같이 해석한다', async () => {
        const withCause = {
            ...row(STACK),
            payload: {
                stack: 'outer@https://x/assets/index-abc.js:9:9',
                causes: [{ message: 'real root', stack: STACK }],
            },
        } as ReportLogRow;
        render(<ReportDetailDrawer row={withCause} onClose={vi.fn()} />);

        pickMap(mapFile('index-abc.js.map'));

        await waitFor(() => expect(screen.getByText(/Caused by: real root/)).toBeTruthy());
        expect(screen.getByText(/getMyProfile \(apps\/web/)).toBeTruthy();
    });

    // "무엇을 보냈나"와 "무엇이 돌아왔나"가 섞여 있으면 클라 버그인지 서버 버그인지
    // 가리는 데 시간이 든다.
    it('요청과 응답을 갈라서 보여준다', () => {
        const withHttp = {
            ...row(),
            payload: {
                message: 'boom',
                http: {
                    url: 'https://api.test/auth/login',
                    method: 'POST',
                    requestBody: { id: 'me', password: '[REDACTED]' },
                    status: 401,
                    responseData: { error: 'bad credentials' },
                },
            },
        } as unknown as ReportLogRow;
        render(<ReportDetailDrawer row={withHttp} onClose={vi.fn()} />);

        expect(screen.getByText('HTTP · Request')).toBeTruthy();
        expect(screen.getByText('HTTP · Response')).toBeTruthy();
        expect(screen.getByText(/\[REDACTED\]/)).toBeTruthy();
        expect(screen.getByText(/bad credentials/)).toBeTruthy();
    });

    it('http 정보가 없으면 두 섹션 다 뜨지 않는다', () => {
        render(<ReportDetailDrawer row={row(STACK)} onClose={vi.fn()} />);

        expect(screen.queryByText('HTTP · Request')).toBeNull();
        expect(screen.queryByText('HTTP · Response')).toBeNull();
    });

    it('stack 없이 cause만 있어도 섹션이 뜬다', () => {
        const causeOnly = {
            ...row(),
            payload: { causes: [{ message: 'only cause', stack: STACK }] },
        } as ReportLogRow;
        render(<ReportDetailDrawer row={causeOnly} onClose={vi.fn()} />);

        expect(screen.getByText('소스맵 선택')).toBeTruthy();
    });
});

describe('ReportDetailDrawer — IDE로 추적', () => {
    const stubClipboard = (writeText: () => Promise<void>) => {
        Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
    };

    it('스택과 함께 `yarn trace` 가 맵을 찾는 데 쓰는 헤더까지 복사한다', async () => {
        const writeText = vi.fn().mockResolvedValue(undefined);
        stubClipboard(writeText);
        const traced = {
            ...row(STACK),
            app: 'mobile',
            payload: { stack: STACK, timestamp: '2026-08-11T07:12:33.000Z', webVersion: '0.36.0' },
        } as ReportLogRow;
        render(<ReportDetailDrawer row={traced} onClose={vi.fn()} />);

        fireEvent.click(screen.getByText('IDE로 추적'));

        await waitFor(() =>
            expect(writeText).toHaveBeenCalledWith(
                `# chatic-report id=r1 app=mobile webVersion=0.36.0 at=2026-08-11T07:12:33.000Z\n${STACK}\n`
            )
        );
        expect(screen.getByText(/복사됨/)).toBeTruthy();
    });

    it('클립보드가 막혀 있으면 직접 복사하라고 알린다', async () => {
        stubClipboard(vi.fn().mockRejectedValue(new Error('denied')));
        render(<ReportDetailDrawer row={row(STACK)} onClose={vi.fn()} />);

        fireEvent.click(screen.getByText('IDE로 추적'));

        await waitFor(() => expect(screen.getByText(/클립보드에 복사하지 못했습니다/)).toBeTruthy());
    });
});
