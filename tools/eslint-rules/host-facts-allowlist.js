'use strict';

/**
 * The files `@nx/workspace-host-facts` lets ask the host what it is. See host-facts.js for why.
 *
 * Four kinds of entry; only the last one shrinks.
 */
module.exports = [
    // The reader: the host profile and `isNative()` live here.
    'libs/bridges/',
    // Each app's entry point, which chooses `@chatic/host`'s ports.
    'apps/web/src/app/host/publishHostPorts.ts',
    'apps/desktop-web/src/app/host/publishHostPorts.ts',
    // The debug overlay, for good: showing the raw host facts is its job.
    'apps/web/src/app/features/debug/overlay/',
    // Every other file that did it when the rule arrived. A domain that moves onto its port takes its
    // files off. A file is added only by a reviewed change, never to quiet the rule.
];
