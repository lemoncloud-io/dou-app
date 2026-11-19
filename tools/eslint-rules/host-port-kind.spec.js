'use strict';

const { RuleTester } = require('eslint');
const tsParser = require('@typescript-eslint/parser');

const rule = require('./host-port-kind');

const options = [{ ports: ['links', 'appShell'] }];
const kind = (port, field = 'kind') => ({ messageId: 'kind', data: { port, field } });

new RuleTester({
    languageOptions: { parser: tsParser, ecmaVersion: 2022, sourceType: 'module' },
}).run('host-port-kind', rule, {
    valid: [
        // Calling the port is the point.
        { code: 'runtime.links.openExternal(url);', options },
        { code: 'runtime.appShell.haptics?.play("light");', options },
        // A port not (yet) in the list may still be read.
        { code: "if (runtime.media.kind === 'shell') {}", options },
        // Another object's `kind`, or another name's port, is not this rule's business.
        { code: "if (message.kind === 'shell') {}", options },
        { code: "if (host.ports.links.kind === 'shell') {}", options },
        { code: "const links = other.links; if (links.kind === 'shell') {}", options },
        // A local name that only shares the port's name is not an alias of it.
        { code: 'const links = []; links.kind;', options },
        // A name bound to the port in one function is not the port in another.
        {
            code: "function a() { const links = runtime.links; links.openUrl(u); } function b(links) { return links.kind === 'x'; }",
            options,
        },
        // `os` is a choice only on the ports that carry one; `links` has none to ask.
        { code: 'runtime.links.os;', options },
        // Destructuring members, not the choice, is the point.
        { code: 'const { openUrl, copyText } = runtime.links;', options },
        // With no ports named, nothing is reported.
        { code: "if (runtime.links.kind === 'shell') {}", options: [{}] },
    ],
    invalid: [
        {
            code: "if (runtime.links.kind === 'shell') {}",
            options,
            errors: [kind('links')],
        },
        {
            code: "const entry = runtime.appShell.kind === 'shell' ? 'icon' : 'browser';",
            options,
            errors: [kind('appShell')],
        },
        {
            // Handed on is still a read: the branch would only move to the callee.
            code: 'report(runtime.links.kind);',
            options,
            errors: [kind('links')],
        },
        {
            code: "if ((runtime as any).appShell?.kind !== 'shell') {}",
            options,
            errors: [kind('appShell')],
        },
        {
            code: "if (runtime['links'].kind === 'browser') {}",
            options,
            errors: [kind('links')],
        },
        {
            code: "const appShell = runtime.appShell; if (appShell.kind !== 'shell') {}",
            options,
            errors: [kind('appShell')],
        },
        {
            code: "const { links: l } = runtime; switch (l.kind) { case 'shell': break; }",
            options,
            errors: [kind('links')],
        },
        {
            code: 'const { kind } = runtime.appShell;',
            options,
            errors: [kind('appShell')],
        },
        {
            code: "const { links: { kind } } = runtime; if (kind === 'shell') {}",
            options,
            errors: [kind('links')],
        },
        {
            code: 'const appShell = runtime.appShell; const { os } = appShell;',
            options,
            errors: [kind('appShell', 'os')],
        },
        {
            code: "if (runtime.appShell.os === 'ios') {}",
            options,
            errors: [kind('appShell', 'os')],
        },
        {
            code: 'const { appShell } = runtime; function f() { return appShell.kind; }',
            options,
            errors: [kind('appShell')],
        },
    ],
});
