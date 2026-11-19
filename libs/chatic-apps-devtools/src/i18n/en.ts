import type { Messages } from './messages';

const MANIFEST = 'public/.well-known/chatic-app.json';

export const en: Messages = {
    title: 'Chatic app check',
    groups: {
        manifest: 'Manifest',
        permissions: 'Permissions',
        code: 'Code',
        bundle: 'Bundle',
        start: 'Starting up',
        backAndClose: 'Back and close',
        display: 'Theme',
        lifecycle: 'Hiding and coming back',
        actions: 'Buttons',
        cloudData: 'Cloud data',
    },
    rules: {
        'manifest/missing': {
            problem: () => 'There is no manifest',
            fix: () => `create ${MANIFEST} with manifestVersion 1, a name and the permissions the page uses`,
        },
        'manifest/invalid': {
            problem: () => 'The manifest cannot be read',
            fix: () => 'make it a JSON object, with permissions as a list',
        },
        'manifest/version': {
            problem: () => 'The manifest has the wrong manifestVersion',
            fix: () => 'set "manifestVersion": 1',
        },
        'manifest/name': {
            problem: () => 'The manifest has no usable name',
            fix: () => 'give "name" 1 to 100 characters',
        },
        'manifest/unknown-field': {
            problem: field => `The app ignores the manifest field "${field}"`,
            fix: () => 'remove it, or fix its spelling (manifestVersion, name, permissions, display, orientation)',
        },
        'manifest/unknown-permission': {
            problem: permission => `"${permission}" is not a permission the app knows`,
            fix: () => 'remove it, or fix its spelling',
        },
        'manifest/display': {
            problem: () => 'The manifest\'s "display" is not one the app knows',
            fix: () => 'use "clean", "titled" or "immersive"',
        },
        'manifest/orientation': {
            problem: () => 'The manifest\'s "orientation" is not one the app knows',
            fix: () => 'use "any", "portrait" or "landscape"',
        },
        'manifest/unused-permission': {
            problem: permission => `The page asks for "${permission}" and never uses it`,
            fix: permission => `remove "${permission}" from the manifest's permissions`,
        },
        'manifest/missing-permission': {
            problem: permission => `The page uses something that needs "${permission}", and does not ask for it`,
            fix: permission => `add "${permission}" to the manifest's permissions`,
        },
        'code/unknown-data-method': {
            problem: method => `${method} is not something the app lets a page read`,
            fix: () => 'use a method listed in the SDK README; the app refuses any other',
        },
        'code/local-storage': {
            problem: () => 'The page keeps data in localStorage, which the phone can clear',
            fix: () => 'use apps.storage instead',
        },
        'code/os-theme': {
            problem: () => "The page follows the phone's dark mode, not the app's",
            fix: () => 'use apps.context.theme and apps.onContextChange',
        },
        'code/history-routing': {
            problem: () => 'The page moves between screens with browser history',
            fix: () => 'keep screens in an in-memory list and use apps.onBack',
        },
        'code/popup': {
            problem: () => 'The page opens a popup or uses window.opener, which replaces it in the app',
            fix: () => 'use apps.openUrl for links, and a redirect for logging in',
        },
        'code/version-compare': {
            problem: () => 'The page compares version numbers',
            fix: () => 'ask apps.supports(…) whether a feature is there',
        },
        'code/error-message': {
            problem: () => "The page decides on an error's message text",
            fix: () => 'check error.code instead',
        },
        'bundle/missing': {
            problem: () => 'The page is not built yet',
            fix: () => 'run your build (npm run build), then verify again',
        },
        'bundle/layout': {
            problem: () => 'The build folder is missing index.html or the manifest at its top',
            fix: () => `put the manifest at ${MANIFEST} and build again`,
        },
        'bundle/build-output-only': {
            problem: () => 'The build folder has files that are not build output (sources, maps, dotfiles)',
            fix: () => 'remove them, or turn source maps off in the build',
        },
        'bundle/mock': {
            problem: () => 'The stand-in for the app (the mock) is in the built page',
            fix: () => 'install it only inside if (import.meta.env.DEV) { … }',
        },
    },
    issues: {
        threw: {
            problem: issue => `The page crashed: ${issue.detail ?? ''}`,
            fix: 'catch the error, and check error.code',
        },
        reported: {
            problem: issue => `The page reported an error: ${issue.detail ?? ''}`,
            fix: 'find where it is thrown and handle it',
        },
        'not-ready': {
            problem: issue => `The page never showed ${issue.detail ?? 'its ready mark'}`,
            fix: 'check that the page starts, or fix "ready" in the scenario file',
        },
        'could-not-run': {
            problem: issue => `This check could not run: ${issue.detail ?? ''}`,
            fix: 'check the scenario file and the build',
        },
        'never-connected': {
            problem: () => 'The page never connects to the app',
            fix: 'call await connect() once when the page starts',
        },
        'no-data-connect': {
            problem: () => 'The page asks for cloud data and never connects to it',
            fix: 'call await apps.data.connect() before reading, or remove the cloud data permissions',
        },
        'root-back-taken': {
            problem: () => 'On its first screen the page keeps the Android back button, so back cannot close it',
            fix: 'call apps.onBack(null) on the first screen',
        },
        'selector-missing': {
            problem: issue => `${issue.screen ?? 'A step'}: ${issue.detail ?? 'a button'} is not on the page`,
            fix: 'fix the selector in chatic-apps.scenarios.ts, or the button',
        },
        'screen-no-back': {
            problem: issue => `${issue.screen}: on this screen, Android back closes the whole page`,
            fix: 'call apps.onBack(back) while a screen is open',
        },
        'back-closed': {
            problem: issue => `${issue.screen}: Android back closed the page instead of going back`,
            fix: 'call apps.onBack(back) while a screen is open',
        },
        'back-still-taken': {
            problem: issue => `${issue.screen}: after going back, the page still keeps the Android back button`,
            fix: 'call apps.onBack(null) when you are back on the first screen',
        },
        'stream-left': {
            problem: issue => `${issue.screen}: ${issue.count} live update(s) keep running after leaving the screen`,
            fix: 'call stop() on each subscription when the screen closes',
        },
        'listener-left': {
            problem: issue => `${issue.screen}: ${issue.count} event listener(s) stay after leaving the screen`,
            fix: 'remove them (removeEventListener) when the screen closes',
        },
        'interval-left': {
            problem: issue => `${issue.screen}: ${issue.count} timer(s) keep running after leaving the screen`,
            fix: 'call clearInterval when the screen closes',
        },
        'root-back-not-closing': {
            problem: () => 'Android back on the first screen does not close the page',
            fix: 'call apps.onBack(null) on the first screen, and do not push browser history',
        },
        'close-not-closing': {
            problem: () => 'The page cannot be closed',
            fix: 'return true from onCloseRequest, or use it only while there is unsaved work',
        },
        'theme-ignored': {
            problem: () => "The page does not change when the app's theme does",
            fix: 'apply the theme in apps.onContextChange',
        },
        'no-save-on-hide': {
            problem: () => 'The page does not save when the app hides it',
            fix: "save to apps.storage when document.visibilityState becomes 'hidden'",
        },
        'asked-again': {
            problem: () => 'After the user said no to sharing cloud data, the page asks again',
            fix: 'on CONSENT_REFUSED, explain why the page needs it and stop',
        },
        'cloud-streams-open': {
            problem: issue => `${issue.count} live update(s) keep running after the user changed cloud`,
            fix: 'stop subscriptions in apps.data.onCloudChanged',
        },
        'cloud-ignored': {
            problem: () => 'The page does not react when the user moves to another cloud',
            fix: 'in apps.data.onCloudChanged, show a notice or call apps.finish()',
        },
        'cloud-retries': {
            problem: () => 'After the user moved to another cloud, the page keeps asking for data',
            fix: 'stop reading in apps.data.onCloudChanged: nothing answers any more',
        },
        'big-list': {
            problem: issue => `${issue.screen}: with a long list the page draws ${issue.count} elements`,
            fix: 'keep and draw only the rows on screen',
        },
        'no-retry': {
            problem: issue => `When reading ${issue.detail} was refused for being too frequent, the page gave up`,
            fix: 'on RATE_LIMITED, wait error.details.retryAfterMs and try again',
        },
    },
    passed: '✓ Ready to hand over.',
    failed: count => `✗ ${count} thing(s) to fix.`,
    noScenarioFile: "Screen checks were skipped: add chatic-apps.scenarios.ts to try each screen's back and clean-up.",
    notBuilt: 'Behaviour checks were skipped: build the page first.',
    talksTo: hosts => `The page talks to: ${hosts} — check what each one receives.`,
    bundle: (files, kilobytes) => `Bundle: ${files} files, ${kilobytes} KB.`,
    detailsHint: 'Add --details to see the rule behind each line.',
    bundled: (file, files) => `✓ Packed ${files} files into ${file}. This is the zip to hand over.`,
    bundleFailed: reason => `✗ Could not pack the page: ${reason}`,
};
