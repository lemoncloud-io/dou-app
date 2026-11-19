---
name: chatic-mini-app
description: Build a Chatic mini-app, a page that opens inside the DoU app, with someone who may never have built a web page — ask about the idea, build it against the SDK's mock, verify it and pack the zip.
---

> Korean: [SKILL.ko.md](./SKILL.ko.md). This English version is the canonical one.

# Building a Chatic mini-app, step by step

Written for `@lemoncloud/chatic-apps-sdk` 0.3.0 and `@lemoncloud/chatic-apps-devtools` 0.1.0.

This is a procedure for an AI assistant helping someone build a Chatic mini-app: a web page that opens
inside the DoU app. The person may never have built a web page. Lead them through three stages by
asking questions — the idea, the first build, the release prep — and end with a zip that passes the
verifier. Do not jump to code.

Three documents in the same package hold what this procedure does not repeat. Read the part you need
before you write code that depends on it:

- `AGENTS.md` — the rules every page keeps. It is the authority; this procedure only points at it.
- `README.md` — every call, its arguments, limits and error codes, and what each permission opens.
- `GUIDE.md` — how a project is set up, the bundle, screens and back, the cloud's data, servers.

## What you may do

- **Edit files inside the project folder**, and nothing outside it.
- **Install once**, in stage 2: exactly the packages and versions in the starting `package.json` below.
  Before installing, say what will be installed and ask. Install nothing else, ever.
- **Run the project's own scripts**: `npm run dev` to show the page, `npm run build`, `npm run verify` and
  `npm run bundle`.
- Make no network requests of your own, read or write no path outside the project, and never upload,
  submit or deploy anything.

## Where are we?

Do this first, every time this procedure starts:

1. **Read `MINIAPP.md`** at the project's top if it exists. It is the plan and the state: say which stage
   it records and what is left, and carry on from there. Do not ask again what it already answers.
2. **Check the SDK version.** If `node_modules/@lemoncloud/chatic-apps-sdk/package.json` exists and its
   `version` is not the one at the top of this file, say so: this copy of the procedure may be out of
   date, and a fresh copy comes with the installed package (see `GUIDE.md`, "For an AI assistant in your
   project").
3. **Otherwise start at stage 1** with whatever the person already said.

## How to ask

- **One question at a time**, in the language the person writes in, in plain words.
- **Offer 2 to 4 choices** when there is something to pick, and say which one you recommend and why, in
  one line. The person can always answer in their own words.
- **Explain a term the first time it comes up**, in one line: a _permission_ is what the page asks the
  app for in its manifest; the _manifest_ is a small file that names the page and lists its permissions;
  the _mock_ is a stand-in for the app that runs in a browser.
- **Never ask again** what the person already said. If they gave a lot at the start, ask only for what
  is missing. If they say "just build it", turn stage 1 into one summary to confirm.
- **End each stage** with a short summary and "Shall we go on to the next stage?".

## Stage 1 — the idea

Ask what is still unknown, in roughly this order. Each line is the question, then what you recommend.

1. What does the mini-app do, in a few sentences? — Nothing to recommend; let them describe it.
2. Who uses it, and when? — Members of one place in a cloud, while they are in DoU.
3. Which screens does it have, and what is on each? — Start with two or three: a first screen and what
   it leads to.
4. When it closes, does it hand a result back? — No, unless something opened it to get one.
5. Does it use the cloud's rooms, messages or members? — Only if the idea needs them; each one is a
   permission the user is asked to allow, and the page's author answers for what it does with it.
6. Does it share, copy or open links outside? — Only what the idea needs; each is a permission too.
7. Does it need the whole screen, like a game? — No: the normal display keeps the app's close button
   and the phone's safe area handled for you.
8. Is there anything the user must not lose, like progress or a draft? — Save it on the device as it
   changes.
9. Does it call a server of your own? — No server is simplest. If yes, read `GUIDE.md`, "Your own
   server", with them.

Then write `MINIAPP.md` at the project's top, in the person's language, and show it:

```markdown
# <name of the mini-app>

Stage: 1 idea — done · 2 first build — next · 3 release prep — not started

## What it does

<a few sentences>

## Screens

1. <first screen>: <what is on it>
2. <screen>: <what is on it, how it is reached, how back returns>

## What it asks the app for

- Permissions: <none, or each one with the reason>
- Display: clean · Orientation: portrait
- Result when it closes: <none, or what>
- Saved on the device: <none, or what>
- Own server: <none, or its address and what it receives>

## Progress

- [ ] Starting files and first install
- [ ] <one line per screen>
- [ ] Verify passes
- [ ] Zip built
```

## Stage 2 — the first build

1. **Ask about the toolchain.** Does the person already use a framework? Recommend none: plain
   TypeScript with Vite. If they name React, Vue or Svelte, follow
   `GUIDE.md`, "Choose a toolchain", and keep everything else below the same.
2. **Lay down the starting files.** If the person already has a working mini-app to start from,
   copy it. Otherwise create the starting files below. Fill the
   manifest from `MINIAPP.md`: its name, and only the permissions it lists.
3. **Install, after asking.** Say: "I will install @lemoncloud/chatic-apps-sdk 0.3.0,
   @lemoncloud/chatic-apps-devtools 0.1.0, Vite 7.3.0 and TypeScript 5.9.3 into this folder with
   `npm install`. Shall I?" Run `npm install` only on a yes.
4. **Build one screen at a time.** Write it, start `npm run dev`, and ask the person to open the address
   it prints in their browser: the page runs there with the mock standing in for the app. Ask what to
   change, change it, and tick the screen in `MINIAPP.md`. Keep the rules in `AGENTS.md` as you go —
   screens in an in-memory stack with `apps.onBack`, the app's theme, `apps.storage`, codes not messages.
5. **Give the mock made-up data** for what the page reads (`src/mockData.ts`): invented ids and names,
   never a real cloud's.
6. **Describe the screens to the verifier** in `chatic-apps.scenarios.ts` once there is more than one
   screen, so it can try each screen's back and clean-up.
7. Update `MINIAPP.md`'s stage line, summarise, and ask to go on.

### Starting files

`package.json` — the exact versions; nothing else is installed:

```json
{
    "name": "my-mini-app",
    "private": true,
    "type": "module",
    "scripts": {
        "dev": "vite",
        "build": "tsc --noEmit && vite build",
        "verify": "chatic-apps verify",
        "bundle": "chatic-apps bundle"
    },
    "dependencies": {
        "@lemoncloud/chatic-apps-sdk": "0.3.0"
    },
    "devDependencies": {
        "@lemoncloud/chatic-apps-devtools": "0.1.0",
        "typescript": "5.9.3",
        "vite": "7.3.0"
    }
}
```

`tsconfig.json`:

```json
{
    "compilerOptions": {
        "target": "ES2022",
        "module": "ESNext",
        "moduleResolution": "bundler",
        "lib": ["ES2022", "DOM"],
        "types": ["vite/client"],
        "strict": true,
        "resolveJsonModule": true,
        "isolatedModules": true,
        "skipLibCheck": true,
        "noEmit": true
    },
    "include": ["src", "public/.well-known/chatic-app.json", "chatic-apps.scenarios.ts"]
}
```

`index.html`:

```html
<!doctype html>
<html lang="en">
    <head>
        <meta charset="UTF-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <title>My mini-app</title>
    </head>
    <body>
        <main id="app"></main>
        <script type="module" src="/src/main.ts"></script>
    </body>
</html>
```

`public/.well-known/chatic-app.json` — the manifest; list only the permissions `MINIAPP.md` names:

```json
{
    "manifestVersion": 1,
    "name": "My mini-app",
    "permissions": [],
    "display": "clean",
    "orientation": "portrait"
}
```

`src/main.ts` — connects, with the mock in development only:

```ts
import { ChaticAppsError, connect, type ChaticApps } from '@lemoncloud/chatic-apps-sdk';
import { installChaticAppsMock, type MockPermission } from '@lemoncloud/chatic-apps-sdk/mock';

import manifest from '../public/.well-known/chatic-app.json';
import { mockData } from './mockData';

const root = document.getElementById('app') as HTMLElement;

function start(apps: ChaticApps) {
    document.documentElement.dataset.theme = apps.context?.theme ?? 'light';
    apps.onContextChange(context => (document.documentElement.dataset.theme = context.theme));
    root.textContent = 'Hello from my mini-app';
}

async function main() {
    // The stand-in for the app, in the browser during development only: a production build drops it.
    if (import.meta.env.DEV) {
        installChaticAppsMock({ permissions: manifest.permissions as MockPermission[], data: mockData });
    }
    try {
        start(await connect());
    } catch (error) {
        const needsUpdate = error instanceof ChaticAppsError && error.code === 'UNSUPPORTED_PROTOCOL';
        root.textContent = needsUpdate ? 'This page needs an update.' : 'This page could not start.';
    }
}

void main();
```

`src/mockData.ts` — what the mock answers when the page reads the cloud, in the browser and in `verify`;
empty until the page reads something:

```ts
import type { MockData } from '@lemoncloud/chatic-apps-sdk/mock';

// Made-up data only: invented ids and names, never a real cloud's.
export const mockData: MockData = {};
```

`chatic-apps.scenarios.ts` — written once there are screens; each `open` lists the clicks from the first
screen that reach one:

```ts
import { mockData } from './src/mockData';

export default {
    data: mockData,
    ready: '[data-action="start"]',
    screens: [{ name: 'question', open: ['[data-action="start"]'] }],
    actions: [],
};
```

## Stage 3 — the release prep

1. **Verify.** Run `npm run build`, then `npm run verify`. It checks the manifest, the code and the
   build, and tries the page against the mock: back, closing, the theme, hiding, refusals.
2. **Go through each line it prints**, one at a time: say in plain words what is wrong and what you
   would change, and ask before changing it. After the fixes, build and verify again. The page is not
   done until verify ends with "Ready to hand over" — never say it is before then.
3. **Offer to try it in the app.** If the person wants to see it on their phone, follow `GUIDE.md`,
   "Trying it in the app", and say its limits before they start.
4. **Pack it.** Run `npm run bundle`: it writes the zip of the build, with `index.html` and the manifest
   at its top. Tell the person where the zip is.
5. **Go through `GUIDE.md`, "Before you hand it over"**, with them, item by item.
6. **Stop there.** Do not upload or submit the zip anywhere. Say: "The mini-app is ready, and so is the
   zip. The way to submit it to DoU is still being prepared." Mark stage 3 done in `MINIAPP.md`.
