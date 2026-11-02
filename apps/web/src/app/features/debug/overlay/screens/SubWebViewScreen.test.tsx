import '@testing-library/jest-dom';

import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { parseParams, SubWebViewScreen } from './SubWebViewScreen';
import { setDebugLanguageForTests } from '../../i18n';

const openSubWebView = jest.fn();
const closeSubWebView = jest.fn();
let closedHandler: ((message: { data: Record<string, unknown> }) => void) | undefined;

jest.mock('../../../../bridge', () => ({
    openSubWebView: (...args: unknown[]) => openSubWebView(...args),
    appBridge: { closeSubWebView: (...args: unknown[]) => closeSubWebView(...args) },
    useOnSubWebViewClosed: (handler: (message: { data: Record<string, unknown> }) => void) => {
        closedHandler = handler;
    },
}));
jest.mock('../../../../bridge/shellCapabilities', () => ({
    shellCapabilities: { subscribe: () => () => undefined, supports: () => true },
}));

const URL_ = 'https://sample.apps-dev.chatic.io/';

describe('parseParams', () => {
    it('reads an empty field as no params', () => {
        expect(parseParams('  ')).toBeUndefined();
    });

    it('reads a JSON object', () => {
        expect(parseParams('{"orderId":7}')).toEqual({ orderId: 7 });
    });

    it.each(['[1]', 'null', '"x"', '{oops'])('refuses %s', raw => {
        expect(parseParams(raw)).toBeInstanceOf(Error);
    });
});

describe('SubWebViewScreen', () => {
    let restoreLanguage: () => void;

    beforeEach(() => {
        jest.clearAllMocks();
        closedHandler = undefined;
        restoreLanguage = setDebugLanguageForTests('en');
    });

    afterEach(() => restoreLanguage());

    it('starts with the sample page filled in', () => {
        render(<SubWebViewScreen />);

        expect(screen.getByLabelText('URL')).toHaveValue('https://sample.apps-dev.chatic.io/');
    });

    it('opens the URL with its params and logs where it went', async () => {
        openSubWebView.mockResolvedValue({ via: 'subWebView', viewId: 'view-1' });
        render(<SubWebViewScreen />);

        await userEvent.clear(screen.getByLabelText('URL'));
        await userEvent.type(screen.getByLabelText('URL'), URL_);
        await userEvent.type(screen.getByPlaceholderText(/orderId/), '{{"orderId":7}');
        await userEvent.click(screen.getByRole('button', { name: 'Open' }));

        expect(openSubWebView).toHaveBeenCalledWith({ url: URL_, title: undefined, params: { orderId: 7 } });
        expect(await screen.findByText('opened in subWebView: view-1')).toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'Close view-1' })).toBeInTheDocument();
    });

    it('does not open with params that are not a JSON object', async () => {
        render(<SubWebViewScreen />);

        await userEvent.clear(screen.getByLabelText('URL'));
        await userEvent.type(screen.getByLabelText('URL'), URL_);
        await userEvent.type(screen.getByPlaceholderText(/orderId/), '[[1]');
        await userEvent.click(screen.getByRole('button', { name: 'Open' }));

        expect(openSubWebView).not.toHaveBeenCalled();
        expect(screen.getByText(/params is not a JSON object/)).toBeInTheDocument();
    });

    it("logs the shell's refusal with its code", async () => {
        openSubWebView.mockRejectedValue(Object.assign(new Error('off the allowlist'), { code: 'NOT_ALLOWED' }));
        render(<SubWebViewScreen />);

        await userEvent.clear(screen.getByLabelText('URL'));
        await userEvent.type(screen.getByLabelText('URL'), 'https://www.naver.com/');
        await userEvent.click(screen.getByRole('button', { name: 'Open' }));

        expect(await screen.findByText('failed: NOT_ALLOWED — off the allowlist')).toBeInTheDocument();
    });

    // The half of the round trip the Bridge screen cannot show.
    it('logs the close with its reason and the result the page handed back', () => {
        render(<SubWebViewScreen />);

        act(() => closedHandler?.({ data: { viewId: 'view-1', reason: 'page', result: { paid: true } } }));

        expect(screen.getByText('closed view-1: page')).toBeInTheDocument();
        expect(screen.getByText('result: {"paid":true}')).toBeInTheDocument();
    });

    it('closes the view it opened last', async () => {
        openSubWebView.mockResolvedValue({ via: 'subWebView', viewId: 'view-1' });
        closeSubWebView.mockResolvedValue({ data: {} });
        render(<SubWebViewScreen />);
        await userEvent.clear(screen.getByLabelText('URL'));
        await userEvent.type(screen.getByLabelText('URL'), URL_);
        await userEvent.click(screen.getByRole('button', { name: 'Open' }));

        await userEvent.click(await screen.findByRole('button', { name: 'Close view-1' }));

        expect(closeSubWebView).toHaveBeenCalledWith('view-1');
    });
});
