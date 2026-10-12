/**
 * One device run per machine. A full native build already saturates a laptop; an iOS build next to
 * an Android build and emulator, with vite and Metro beside them, has restarted one. Other
 * checkouts and other agent sessions share the machine, so the guard has to be machine-wide:
 *
 * - a lock directory under the user's cache, held by at most one runner at a time, and
 * - a scan for heavy work the lock cannot see — someone's xcodebuild, a Gradle build, an emulator
 *   not started by this harness — because not everyone building an app goes through this runner.
 */
const fs = require('fs');
const os = require('os');
const path = require('path');

const { probe } = require('./proc');

const HARNESS_HOME = path.join(os.homedir(), '.cache', 'dou-device-verify');
const LOCK_DIR = path.join(HARNESS_HOME, 'lock');

/**
 * Whether the lock's holder is still a device-verify run. A pid alone is not enough: after a run is
 * killed outright its pid gets reused, and a lock judged by the pid would then never go stale.
 */
function isAlive(pid) {
    try {
        process.kill(pid, 0);
    } catch (error) {
        if (error.code !== 'EPERM') return false;
    }
    return probe('ps', ['-o', 'command=', '-p', String(pid)]).stdout.includes('mobile-verify');
}

/**
 * Take the lock if it is free or its holder is dead. `mkdir` is the atomic step: two runners
 * racing for it cannot both succeed. Returns { acquired: true } or { acquired: false, holder }.
 */
function tryAcquireLock(owner, { lockDir = LOCK_DIR, alive = isAlive } = {}) {
    fs.mkdirSync(path.dirname(lockDir), { recursive: true });
    for (let attempt = 0; attempt < 2; attempt++) {
        try {
            fs.mkdirSync(lockDir);
            fs.writeFileSync(path.join(lockDir, 'owner.json'), JSON.stringify(owner, null, 2));
            return { acquired: true };
        } catch (error) {
            if (error.code !== 'EEXIST') throw error;
        }
        const holder = readHolder(lockDir);
        // A holder that never finished writing owner.json, or whose process is gone, left the lock
        // behind by crashing; take it over once.
        const stale = holder ? !alive(holder.pid) : Date.now() - fs.statSync(lockDir).mtimeMs > 60_000;
        if (!stale) return { acquired: false, holder };
        // Take the stale lock out of the way by renaming it — atomic, so of two runners that both
        // judged it stale only one moves it — and check that what moved is the lock judged stale,
        // not a fresh one another runner made in between.
        const moved = `${lockDir}.stale-${process.pid}`;
        try {
            fs.renameSync(lockDir, moved);
        } catch {
            continue;
        }
        const movedHolder = readHolder(moved);
        if (holder && movedHolder?.pid !== holder.pid) {
            fs.renameSync(moved, lockDir);
            return { acquired: false, holder: movedHolder };
        }
        fs.rmSync(moved, { recursive: true, force: true });
    }
    return { acquired: false, holder: readHolder(lockDir) };
}

function readHolder(lockDir) {
    try {
        return JSON.parse(fs.readFileSync(path.join(lockDir, 'owner.json'), 'utf8'));
    } catch {
        return null;
    }
}

/** Release only a lock this process holds — never another runner's. */
function releaseLock({ lockDir = LOCK_DIR, pid = process.pid } = {}) {
    const holder = readHolder(lockDir);
    if (holder && holder.pid === pid) fs.rmSync(lockDir, { recursive: true, force: true });
}

/**
 * Heavy work running on the machine, from `ps -axo pid=,command=` output. An emulator booted from
 * `ownAvd` — only ever the harness's own `DoU_Verify`, which nobody else boots — is the harness's
 * device left running by `--keep-device`, not someone else's. An AVD named by `DOU_VERIFY_AVD` may
 * be anyone's everyday emulator, so it is never excluded.
 */
function findHeavyWork(psOutput, { ownAvd, ownPid = process.pid } = {}) {
    const found = [];
    for (const line of psOutput.split('\n')) {
        const match = line.trim().match(/^(\d+)\s+(.*)$/);
        if (!match) continue;
        const pid = Number(match[1]);
        const command = match[2];
        if (pid === ownPid) continue;
        const executable = command.split(' ')[0];
        if (executable.endsWith('/xcodebuild') || executable === 'xcodebuild') {
            // `test-without-building` is the XCUITest driver Maestro and Appium keep open for a whole
            // session — a device in use, not a build — and it would block every run while it lives.
            if (/\stest-without-building(\s|$)/.test(command)) continue;
            found.push({ pid, kind: 'xcodebuild', command });
        } else if (/org\.gradle\.(wrapper\.GradleWrapperMain|launcher\.GradleMain)/.test(command)) {
            found.push({ pid, kind: 'gradle build', command });
        } else if (/qemu-system-\S+/.test(executable)) {
            const avd = command.match(/-avd\s+(\S+)/)?.[1];
            if (avd && avd === ownAvd) continue;
            const port = command.match(/-port\s+(\d+)/)?.[1];
            found.push({
                pid,
                kind: `Android emulator${avd ? ` (${avd})` : ''}`,
                command,
                emulator: { avd, serial: port ? `emulator-${port}` : null },
            });
        }
    }
    return found;
}

/**
 * What to do about each kind of busy, printed when the wait gives up. A build or another run ends on
 * its own; an emulator does not, and only whoever started it should stop it — except the harness's
 * own AVD, which nobody else boots: running while no run holds the lock, it was left by
 * `--keep-device` or a run that died, and stopping it is safe.
 */
function busyFixes(busy, harnessAvd) {
    const fixes = [];
    if (busy.some(work => work.hold)) {
        fixes.push(
            'A run is holding the app up for hand checks (--app-only); it lasts until whoever started it stops it. Ask them, or the user.'
        );
    }
    if (busy.some(work => !work.emulator && !work.hold)) {
        fixes.push(
            'A build or another device run ends on its own: run again later, or with a longer --wait <minutes>.'
        );
    }
    for (const work of busy.filter(w => w.emulator)) {
        if (work.emulator.avd === harnessAvd) {
            const serial = work.emulator.serial ?? '<its serial from `adb devices`>';
            fixes.push(
                `pid ${work.pid} is this harness's own emulator, left running by a --keep-device run or a run that died; stop it with: adb -s ${serial} emu kill`
            );
        } else {
            fixes.push(
                `pid ${work.pid} is an emulator, which does not stop on its own: whoever runs it (in ${work.cwd ?? 'the folder above'}) has to stop it. Ask the user; do not stop another session's emulator yourself.`
            );
        }
    }
    return fixes;
}

function scanHeavyWork(ownAvd) {
    const { stdout } = probe('ps', ['-axo', 'pid=,command=']);
    return findHeavyWork(stdout, { ownAvd }).map(work => ({ ...work, cwd: cwdOf(work.pid) }));
}

/** The working directory of a process, which usually names the checkout it belongs to. */
function cwdOf(pid) {
    const { stdout } = probe('lsof', ['-a', '-p', String(pid), '-d', 'cwd', '-Fn'], { timeoutMs: 5000 });
    return (
        stdout
            .split('\n')
            .find(line => line.startsWith('n'))
            ?.slice(1) ?? '?'
    );
}

module.exports = {
    HARNESS_HOME,
    LOCK_DIR,
    isAlive,
    tryAcquireLock,
    releaseLock,
    findHeavyWork,
    busyFixes,
    scanHeavyWork,
};
