/**
 * The seam between the runner and the tool that drives the app. The runner owns the machine — the
 * lock, the device, the build, the servers, the tree — and hands an adapter a booted device with the
 * app installed. The adapter owns everything about the scenario files: their extension, how their
 * tags are read, how they run, and how a tool failure is told apart from a scenario failure.
 *
 * @typedef {object} RunContext
 * @property {'ios' | 'android'} platform
 * @property {string} deviceId    simulator UDID or adb serial — always explicit, devices are shared
 * @property {string} flowFile    absolute path of the scenario file
 * @property {string} outDir      where screenshots and reports go (gitignored)
 * @property {Record<string, string>} vars   values the scenario reads: APP_ID, APP_SCHEME, …
 * @property {NodeJS.ProcessEnv} env        child-process environment (UTF-8 locale, ANDROID_HOME, …)
 * @property {string} logFile
 *
 * @typedef {object} RunResult
 * @property {boolean} passed
 * @property {string} summary         one line for the terminal
 * @property {string[]} checkpoints   screenshots the scenario asked a person or agent to judge
 *
 * @typedef {object} Adapter
 * @property {string} name
 * @property {string} flowExtension                     e.g. '.yaml'
 * @property {(text: string) => { tags: string[] }} readMeta
 * @property {(env: NodeJS.ProcessEnv) => { message: string, fix: string[] }[]} preflight
 * @property {(context: RunContext) => Promise<RunResult>} run   throws EnvironmentError when the tool, not the app, failed
 */

/** The adapter in use. One today; the seam is what lets the tool change without touching the runner. */
function loadAdapter() {
    return require('./maestro');
}

module.exports = { loadAdapter };
