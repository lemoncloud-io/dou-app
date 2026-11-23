# Routing

- `/i?t=...` has its own route. Without it the encoded invite link falls to the catch-all, which redirects to `/` and
  drops the token, so a browser that did not hand the link to the app would show the marketing page with no way into the
  invite.
- `RouteErrorFallback` is not the shared package's router error screen: that one is built from the shared UI kit's
  buttons and expects shadcn tokens this site's Tailwind config does not define.
- Its recovery actions are a page reload and a plain anchor to `/`, not router links: the router that just failed is the one that would handle them.
