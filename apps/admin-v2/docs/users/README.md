# users

**Where an operator lists relay users and registers a new one.** The screen at `/users` pages
through the relay's user list ten rows at a time — id, name, login id, created — and has one action,
**Add User**, which creates an account. It was carried over from the retired `apps/admin` when that
app's screens moved into this console. Feature code: `apps/admin-v2/src/app/features/users/`.

## Design principles

- **The listing lives here, not on the shared runtime.** `useUsers` (`api/usersQuery.ts`) reads
  `listRelayUsers` from the runtime's user repository, but the hook and its query key sit in this
  feature: this console is the only caller the listing has ever had, so a hook on the shared runtime
  surface would be a shared API with one consumer.
- **Registration goes through the session's register call.** The dialog calls the runtime's
  `useRegisterUserV2` with `stereo: 'user'` and the name, login id and password entered. A login id
  that looks like an email address is flagged as one (`email: true`); anything else registers as a
  plain login id. The site and cloud fields of the old form are hidden and go out empty.
- **No token issuance.** The old admin's list had a column that signed in as the listed user and
  handed back that user's identity token. It relied on one shared credential kept in the source, and
  the hook behind it no longer existed, so it did not come across. If an operator needs a token for
  a user, build it on the auth service's token-generation endpoint, which takes real inputs, rather
  than reviving the impersonation shortcut.

## What it does not do

The screen does not edit, delete or search users, and shows nothing about a user's clouds, places
or subscription — subscriptions are [memberships/](../memberships/README.md).
