const USAGE = `Usage:
  yarn mobile:verify <feature>[/<scenario>] --platform ios|android [options]
  yarn mobile:verify --tag smoke --platform ios|android [options]
  yarn mobile:verify --app-only --platform ios|android [options]
  yarn mobile:verify --list

  <feature>             a folder under apps/mobile/e2e/flows (named after apps/web/src/app/features)
  <feature>/<scenario>  one scenario file in it, without the extension; omit it to run them all

Options:
  --platform ios|android  required to run; one platform per run, never both
  --tag <tag>             run every scenario carrying the tag (e.g. smoke) instead of naming one
  --app-only              no scenario: build, install and launch the app, then keep the device, web and
                          Metro up for hand checks until stopped (Ctrl-C / SIGTERM)
  --web local|dev         local (default): serve this checkout's apps/web; dev: the deployed dev web
  --rebuild               build the native app even when the last build is still current
  --wait <minutes>        how long to wait for another device run or build to finish (default 15)
  --keep-device           leave the simulator/emulator running afterwards for hand checks
  --show-device           show the device: open Simulator.app / give the emulator a window
  --record                record a video of the whole run
  --list                  list the scenarios and their tags
  --help                  this text

Exit codes: 0 passed · 1 scenario failed · 2 could not run (environment or invocation)`;

const PLATFORMS = ['ios', 'android'];
const WEB_MODES = ['local', 'dev'];

/**
 * Parse argv (without node and the script path). Throws a plain Error with a usage message for a
 * malformed invocation; the caller maps that to exit 2.
 */
function parseArgs(argv) {
    const options = {
        target: null,
        platform: null,
        tag: null,
        web: 'local',
        rebuild: false,
        waitMinutes: 15,
        keepDevice: false,
        showDevice: false,
        record: false,
        list: false,
        help: false,
        appOnly: false,
    };
    const takeValue = (flag, index) => {
        const value = argv[index + 1];
        if (value === undefined || value.startsWith('--')) throw new Error(`${flag} needs a value.`);
        return value;
    };

    for (let i = 0; i < argv.length; i++) {
        const arg = argv[i];
        switch (arg) {
            case '--platform':
                options.platform = takeValue(arg, i++);
                break;
            case '--tag':
                options.tag = takeValue(arg, i++);
                break;
            case '--web':
                options.web = takeValue(arg, i++);
                break;
            case '--wait':
                options.waitMinutes = Number(takeValue(arg, i++));
                break;
            case '--rebuild':
                options.rebuild = true;
                break;
            case '--keep-device':
                options.keepDevice = true;
                break;
            case '--show-device':
                options.showDevice = true;
                break;
            case '--record':
                options.record = true;
                break;
            case '--app-only':
                options.appOnly = true;
                break;
            case '--list':
                options.list = true;
                break;
            case '--help':
            case '-h':
                options.help = true;
                break;
            default:
                if (arg.startsWith('-')) throw new Error(`Unknown option ${arg}.`);
                if (options.target) throw new Error(`One target per run; got "${options.target}" and "${arg}".`);
                options.target = arg;
        }
    }

    if (options.help || options.list) return options;
    if (options.appOnly && (options.target || options.tag)) {
        throw new Error('--app-only runs no scenario; drop the target.');
    }
    if (!options.appOnly && !options.target && !options.tag) {
        throw new Error('Name a <feature>[/<scenario>], pass --tag, or pass --app-only.');
    }
    if (options.target && options.tag) throw new Error('Pass either a target or --tag, not both.');
    if (!PLATFORMS.includes(options.platform)) throw new Error('--platform must be ios or android.');
    if (!WEB_MODES.includes(options.web)) throw new Error('--web must be local or dev.');
    if (!Number.isFinite(options.waitMinutes) || options.waitMinutes < 0) {
        throw new Error('--wait takes a number of minutes (0 = do not wait).');
    }
    return options;
}

module.exports = { parseArgs, USAGE };
