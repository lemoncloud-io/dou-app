# shell

The main window and how it reaches the web.

## Loading

The window opens the local `ui/index.html` with the web address in its `to` query. `ui/loader.js` requests the address (no-cors, 8 s limit) and replaces the page with it once the request succeeds. While it fails the page says "No connection" and retries on a growing delay (1, 2, 4, 8, then every 15 seconds), or at once on the button. Only an `https` address is followed.

The address is baked at build time: `DOU_WEB_URL` if set, else the dev web in a debug build and the production web in a release build. The same address will be the only origin the bridge capability allows.
