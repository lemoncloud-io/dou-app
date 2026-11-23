'use strict';

const DouJsdomEnvironment = require('./jsdom-environment');

const ignore = () => undefined;
const quietConsole = { log: ignore, info: ignore, warn: ignore, error: ignore, debug: ignore };

const makeEnvironment = () =>
    new DouJsdomEnvironment(
        { globalConfig: {}, projectConfig: { testEnvironmentOptions: {}, globals: {} } },
        { console: quietConsole, docblockPragmas: {}, testPath: __filename }
    );

const finishTest = environment => {
    const test = { errors: [] };
    environment.handleTestEvent({ name: 'test_done', test }, { unhandledErrors: [] });
    return test.errors;
};

const finishFile = environment => {
    const state = { unhandledErrors: [] };
    environment.handleTestEvent({ name: 'run_finish' }, state);
    return state.unhandledErrors;
};

describe('the shared jsdom environment', () => {
    let environment;

    beforeEach(() => {
        environment = makeEnvironment();
    });

    afterEach(async () => {
        await environment.teardown();
    });

    it('gives the page TextEncoder and TextDecoder, which the socket lib needs at import time', () => {
        const { TextEncoder, TextDecoder } = environment.global;

        expect(new TextDecoder().decode(new TextEncoder().encode('채팅'))).toBe('채팅');
    });

    it('fails the test that navigates the page, which jsdom only prints', () => {
        environment.global.location.href = '/elsewhere';

        const errors = finishTest(environment);

        expect(errors).toHaveLength(1);
        expect(errors[0].message).toMatch(/Not implemented: navigation/);
    });

    it('fails the test that plays media, which jsdom only prints', () => {
        environment.global.document.createElement('video').pause();

        expect(finishTest(environment)[0].message).toMatch(/HTMLMediaElement.prototype.pause/);
    });

    it('charges each call to the test that made it, and leaves a clean test alone', () => {
        environment.global.location.assign('/first');
        finishTest(environment);

        expect(finishTest(environment)).toEqual([]);
    });

    it('fails the file when the call comes after its last test, in afterAll or a late timer', () => {
        environment.global.location.assign('/late');

        expect(finishFile(environment)[0].message).toMatch(/outside any test.*Not implemented: navigation/);
    });
});
