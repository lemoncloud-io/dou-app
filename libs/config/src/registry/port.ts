import type { ConfigEntry, ConfigRegistryModule } from '../types';

/**
 * Which adapter fills each runtime port — one string key per port.
 *
 * The value is an adapter id, `<port>.<adapter>` (`cache.memory`, `appShell.native`): the port name
 * exactly as it appears in the key, then the adapter in lower case with dashes. The empty string is
 * the floor and means "no choice made here — use the default the app declared for this port".
 *
 * This lib stores and resolves the choice and nothing more. It does not know which adapters exist,
 * which one is a port's default, or whether the host can run the one chosen: the app declares that,
 * and the code that builds the port checks the resolved id against its declaration and the host,
 * falling back to the declared default when the id is unknown there. The `pattern` only rejects ids
 * that cannot be anybody's — a typo'd shape, or another port's id — so they are demoted to the next
 * row instead of reaching that check.
 *
 * Declared like the other developer levers. `dev`, so on a PROD build the local lane only takes a
 * value after the override unlock. Every lane may supply one — the shell, this browser and both server
 * rows — because the point is to switch an adapter without a release. `persist: 'local'` rather than
 * `session`, because an adapter is chosen at boot (`appliesAt: 'restart'`) and the choice has to
 * survive the restart that applies it. A build may also name one through `VITE_PORT_<PORT>`, which
 * sits below a lane and above the empty floor.
 */
const choice = (port: string, envName: string, title: string, description: string): ConfigEntry<string> => ({
    title,
    description: `${description} Empty uses the app's declared default.`,
    type: 'string',
    pattern: new RegExp(`^(?:${port}\\.[a-z0-9]+(?:-[a-z0-9]+)*)?$`),
    defaultValue: '',
    envDefaultKey: `VITE_PORT_${envName}`,
    surface: 'dev',
    writableBy: ['shell', 'local', 'server'],
    persist: 'local',
    appliesAt: 'restart',
});

export const portModule: ConfigRegistryModule = {
    'port.storage': choice('storage', 'STORAGE', 'Storage adapter', 'Where the app keeps its data on this device.'),
    'port.transport': choice('transport', 'TRANSPORT', 'Transport adapter', 'How the app reaches the server.'),
    'port.auth': choice('auth', 'AUTH', 'Auth adapter', 'Who holds and refreshes the session credentials.'),
    'port.foreground': choice(
        'foreground',
        'FOREGROUND',
        'Foreground adapter',
        'How the app learns it moved to the foreground or the background.'
    ),
    'port.cache': choice('cache', 'CACHE', 'Cache adapter', 'Where read results are cached.'),
    'port.checkout': choice('checkout', 'CHECKOUT', 'Checkout adapter', 'Who sells a subscription.'),
    'port.media': choice('media', 'MEDIA', 'Media adapter', 'Who picks and prepares photos and videos.'),
    'port.files': choice('files', 'FILES', 'Files adapter', "Who uploads and downloads a message's files."),
    'port.links': choice(
        'links',
        'LINKS',
        'Links adapter',
        'Who opens URLs, uses the clipboard and takes in shared content.'
    ),
    'port.appShell': choice(
        'appShell',
        'APP_SHELL',
        'App shell adapter',
        'Who handles the icon, badge, haptics, back gesture, keyboard and update.'
    ),
    'port.signIn': choice(
        'signIn',
        'SIGN_IN',
        'Sign-in adapter',
        'Who runs social sign-in, account linking and device pairing.'
    ),
    'port.diagnostics': choice(
        'diagnostics',
        'DIAGNOSTICS',
        'Diagnostics adapter',
        'Who queues logs and issue reports.'
    ),
    'port.push': choice('push', 'PUSH', 'Push adapter', 'Who registers the device for push and receives taps.'),
    'port.logSink': choice('logSink', 'LOG_SINK', 'Log sink adapter', 'Where log entries are written.'),
};
