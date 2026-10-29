#!/usr/bin/env node
/**
 * `yarn local:pair` — open DoU in the virtual shell and sign it in from a phone, from a terminal.
 *
 * 1. Reuses the dev virtual shell when one answers on its port, or starts `hybrid-shell local`.
 * 2. Opens the shell in a visible Chromium window with a profile kept between runs, so a sign-in made
 *    once is still there next time (the shell's web runs in native mode, which keeps the session in
 *    the origin's localStorage).
 * 3. Already signed in: says as whom, and leaves the window open.
 * 4. A guest: opens "Sign in with another device", prints the code, and waits. The person types it
 *    into the DoU app on their phone (My page › Approve web sign-in). An expired code is replaced and
 *    printed again.
 * 5. Approved: prints the account (or the cloud) and leaves the shell signed in.
 *
 * Ctrl-C closes the window, and stops the shell when this run started it.
 */
import { spawn } from 'node:child_process';
import { homedir } from 'node:os';
import { join, resolve } from 'node:path';

import { chromium } from '@playwright/test';

const ROOT = resolve(new URL('../../..', import.meta.url).pathname);
const SHELL_URL = process.env.DOU_SHELL_URL ?? 'http://localhost:5007/__shell/';
const PROFILE_DIR = process.env.DOU_SHELL_PROFILE ?? join(homedir(), '.cache', 'dou-local-pair');
const PAIR_PATH = '/mypage/login/pair';
const SIGNIN_TIMEOUT_MS = 15 * 60 * 1000;

const say = message => process.stdout.write(`${message}\n`);
const sleep = ms => new Promise(done => setTimeout(done, ms));

/** True when something already serves the shell page. */
const shellAnswers = async () => {
    try {
        return (await fetch(SHELL_URL, { signal: AbortSignal.timeout(2000) })).ok;
    } catch {
        return false;
    }
};

/** Starts `hybrid-shell local` and resolves once the web behind it answers. */
const startShell = () =>
    new Promise((resolveStart, rejectStart) => {
        say('Starting the virtual shell (dev)…');
        const child = spawn(join(ROOT, 'node_modules/.bin/hybrid-shell'), ['local'], {
            cwd: ROOT,
            stdio: ['ignore', 'pipe', 'pipe'],
        });
        let output = '';
        const onData = chunk => {
            output += chunk.toString();
            if (output.includes('the web answers at')) resolveStart(child);
        };
        child.stdout.on('data', onData);
        child.stderr.on('data', onData);
        child.on('exit', code =>
            rejectStart(new Error(`hybrid-shell local exited (${code}):\n${output.slice(-2000)}`))
        );
        setTimeout(() => {
            child.kill('SIGTERM');
            rejectStart(new Error(`the virtual shell did not come up within 3 minutes:\n${output.slice(-2000)}`));
        }, 180_000).unref();
    });

/** The app's frame inside the shell page. */
const appFrame = async page => {
    for (let i = 0; i < 120; i++) {
        const frame = page.frames().find(f => f !== page.mainFrame() && f.url().startsWith('http'));
        if (frame) return frame;
        await sleep(500);
    }
    throw new Error('the shell never showed the app');
};

/** Who the app is signed in as: `{ guest, name }`, read from the relay session the app stored. */
const sessionOf = frame =>
    frame.evaluate(() => {
        try {
            const token = JSON.parse(localStorage.getItem('chatic-relay-token') ?? 'null');
            const paired = JSON.parse(localStorage.getItem('chatic-paired-cloud-ids') ?? '[]');
            const user = token?.$user ?? token;
            return {
                signedIn: !!token,
                guest: !token || user?.userRole === 'guest',
                name: user?.name ?? '',
                pairedClouds: Array.isArray(paired) ? paired : [],
            };
        } catch {
            return { signedIn: false, guest: true, name: '', pairedClouds: [] };
        }
    });

/** Moves the app's own router to a path, the way a link inside the app would. */
const openInApp = (frame, path) =>
    frame.evaluate(target => {
        window.history.pushState({}, '', target);
        window.dispatchEvent(new PopStateEvent('popstate'));
    }, path);

const readCode = frame =>
    frame.evaluate(() => {
        const code = document.querySelector('[data-testid="pairing-code"]');
        const expired = !!code?.classList.contains('line-through');
        return code ? { code: code.textContent?.trim() ?? '', expired } : null;
    });

let shellProcess = null;

const main = async () => {
    if (!(await shellAnswers())) shellProcess = await startShell();

    const context = await chromium.launchPersistentContext(PROFILE_DIR, {
        headless: false,
        viewport: { width: 1280, height: 900 },
        // This script owns Ctrl-C: it closes the window and the shell it started, then exits cleanly.
        handleSIGINT: false,
        handleSIGTERM: false,
    });
    // Closing the window is a way to finish too.
    context.on('close', () => {
        shellProcess?.kill('SIGTERM');
        process.exit(0);
    });
    const stop = async () => {
        await context.close().catch(() => undefined);
        shellProcess?.kill('SIGTERM');
    };
    process.on('SIGINT', () => void stop().then(() => process.exit(0)));

    const page = context.pages()[0] ?? (await context.newPage());
    await page.goto(SHELL_URL);
    await page.waitForFunction(() => window.virtualShell?.status().handshake === 'ready', null, { timeout: 120_000 });
    const frame = await appFrame(page);
    // The boot signs a fresh install in as a guest; wait until that session is stored.
    for (let i = 0; i < 60 && !(await sessionOf(frame).catch(() => ({ signedIn: false }))).signedIn; i++) {
        await sleep(1000);
    }

    const before = await sessionOf(frame);
    if (!before.guest) {
        say(`Connected: signed in as ${before.name || 'an account'}. The shell window is ready.`);
        say('Ctrl-C closes it.');
        return;
    }

    await openInApp(frame, PAIR_PATH);
    let shown = '';
    const deadline = Date.now() + SIGNIN_TIMEOUT_MS;
    while (Date.now() < deadline) {
        const session = await sessionOf(frame).catch(() => before);
        if (!session.guest) {
            say(`\nConnected: signed in as ${session.name || 'an account'}. The shell window is ready.`);
            say('Ctrl-C closes it.');
            return;
        }
        if (session.pairedClouds.length > before.pairedClouds.length) {
            say(`\nConnected: entered the approved cloud (${session.pairedClouds.at(-1)}) as a guest.`);
            say('Ctrl-C closes it.');
            return;
        }
        const state = await readCode(frame).catch(() => null);
        if (!state) {
            const outcome = await frame
                .evaluate(() => document.querySelector('[data-testid="pairing-outcome"]')?.textContent?.trim() ?? null)
                .catch(() => null);
            if (outcome) throw new Error(`the code screen stopped: ${outcome}`);
            const path = await frame.evaluate(() => location.pathname).catch(() => PAIR_PATH);
            if (!path.startsWith(PAIR_PATH)) {
                throw new Error('the app left the code screen — is the device pairing flag on for this backend?');
            }
        }
        if (state?.expired) {
            say('The code expired — getting a new one…');
            await frame
                .getByText(/새 코드 받기|Get a new code/)
                .click()
                .catch(() => undefined);
            shown = '';
        } else if (state?.code && state.code !== shown) {
            shown = state.code;
            say(`\nCode: ${shown}`);
            say(
                'On a signed-in phone: DoU › My page › Approve web sign-in, then enter this code (or scan the QR in the window).'
            );
            say('Waiting for the approval…');
        }
        await sleep(1500);
    }
    throw new Error('no approval within 15 minutes');
};

main().catch(error => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    // A shell this run started must not outlive it.
    shellProcess?.kill('SIGTERM');
    process.exit(1);
});
