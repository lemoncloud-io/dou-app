const USAGE = `Usage:
  yarn local [--mode web|shell|native] [--env dev|prod] [--platform ios|android]

  --mode shell     (default) the web inside the virtual mobile shell — no simulator, no mobile toolchain
  --mode web       the web dev server alone, as a plain browser page
  --mode native    the existing simulator/emulator run (yarn mobile:<platform>:local), unchanged
  --env dev|prod   the backend the web talks to. Asked for in a terminal (Enter = dev), dev otherwise.
                   prod is accepted in shell mode only, where the page carries a PROD band
  --platform       native mode only: ios (default) or android
  --help           this text`;

const MODES = ['web', 'shell', 'native'];
const ENVS = ['dev', 'prod'];
const PLATFORMS = ['ios', 'android'];

/** Parse argv (without node and the script path). Throws an Error naming what is wrong. */
function parseArgs(argv) {
    const options = { mode: 'shell', env: null, platform: 'ios', help: false };
    const takeValue = (flag, index) => {
        const value = argv[index + 1];
        if (value === undefined || value.startsWith('--')) throw new Error(`${flag} needs a value.`);
        return value;
    };
    for (let i = 0; i < argv.length; i++) {
        const arg = argv[i];
        switch (arg) {
            case '--mode':
                options.mode = takeValue(arg, i++);
                break;
            case '--env':
                options.env = takeValue(arg, i++);
                break;
            case '--platform':
                options.platform = takeValue(arg, i++);
                break;
            case '--help':
            case '-h':
                options.help = true;
                break;
            default:
                throw new Error(`Unknown argument: ${arg}`);
        }
    }
    if (!MODES.includes(options.mode)) throw new Error(`--mode must be one of ${MODES.join(', ')}.`);
    if (options.env !== null && !ENVS.includes(options.env))
        throw new Error(`--env must be one of ${ENVS.join(', ')}.`);
    if (!PLATFORMS.includes(options.platform)) throw new Error(`--platform must be one of ${PLATFORMS.join(', ')}.`);
    return options;
}

/**
 * prod only where the page can say so. The web mode has no shell page to carry the PROD band, and the
 * native mode wraps scripts that build the dev app from the checkout's own `.env` — neither could
 * show that it talks to real accounts, so neither takes it.
 */
function prodRefusal(options) {
    if (options.env !== 'prod' || options.mode === 'shell') return null;
    return 'prod can only be chosen in shell mode, where the page carries a PROD band. Run: yarn local --env prod';
}

/**
 * Which backend, when none was named: a person at a terminal is asked (Enter takes dev); anything
 * else — an agent, CI, a pipe — gets dev without a question it could not answer. Only the shell mode
 * asks: it is the only one that may run against prod, so anywhere else the answer is already dev.
 */
async function resolveEnv(options, { interactive, ask }) {
    if (options.env) return options.env;
    if (options.mode === 'native') return null;
    if (!interactive || options.mode !== 'shell') return 'dev';
    const answer = (await ask('Backend environment — dev or prod? [dev] ')).trim().toLowerCase();
    if (answer === '' || answer === 'dev') return 'dev';
    if (answer === 'prod') return 'prod';
    throw new Error(`Unknown environment "${answer}" — answer dev or prod.`);
}

module.exports = { USAGE, parseArgs, prodRefusal, resolveEnv };
