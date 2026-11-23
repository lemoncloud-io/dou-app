const { TextDecoder, TextEncoder } = require('node:util');
const { TestEnvironment } = require('jest-environment-jsdom');

class DouJsdomEnvironment extends TestEnvironment {
    constructor(config, context) {
        super(config, context);
        this.global.TextEncoder ??= TextEncoder;
        this.global.TextDecoder ??= TextDecoder;
        this.unimplemented = [];
        this.dom.virtualConsole.on('jsdomError', error => {
            if (error?.type === 'not implemented') this.unimplemented.push(error.message);
        });
    }

    handleTestEvent(event, state) {
        if (this.unimplemented.length === 0) return;
        if (event.name === 'test_done') event.test.errors.push(this.takeError('this test'));
        if (event.name === 'run_finish') state.unhandledErrors.push(this.takeError('this file, outside any test'));
    }

    takeError(where) {
        const reached = [...new Set(this.unimplemented)].join('; ');
        this.unimplemented = [];
        const error = new Error(
            `Code run by ${where} called a browser API jsdom does not implement (${reached}). ` +
                'Stub it so the test asserts what the app does instead of what jsdom prints.'
        );
        error.stack = error.message;
        return error;
    }
}

module.exports = DouJsdomEnvironment;
module.exports.TestEnvironment = DouJsdomEnvironment;
