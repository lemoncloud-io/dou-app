# push — the hook that starts device-token registration

`runtime.push` holds the React side of push registration. What decides when to register and when not
to — the once-per-install record, the triggers, the floor, the failure handling — is runtime-core's
`PushRegistration`, with no React in it:
[runtime-core docs/push/](../../../runtime-core/docs/push/README.md).

## Layout

```text
push/
├── index.ts                               the `push` facade group
└── hooks/useDeviceTokenRegistration.ts    starts and stops the registration
```

## Usage

```tsx
runtime.push.useDeviceTokenRegistration(delegate); // `null` outside a native shell
```

The app builds the delegate — how to get a token is shell knowledge — and mounts the hook where it
chooses ([the delegate contract](../../../runtime-core/docs/push/README.md#the-shared-contract)).

The hook:

- makes one `PushRegistration` for its lifetime and starts it while there is a delegate, stopping it on
  unmount;
- hands it the latest delegate and the device ids `useDynamicDeviceId` resolves, read at each attempt,
  so a delegate rebuilt on every render does not restart it;
- passes on a window `focus`. The foreground port carries visibility only, and a page also hears the
  window come back without a visibility change — a desktop window that stayed visible behind another
  app.

`runtime.push.useRegisterDeviceTokenMutation()` is the same registration call as a react-query mutation,
for a screen that registers by hand (apps/web's push debug screen). The runtime's own registration does
not go through it.

## Further reading

- [runtime-core docs/push/](../../../runtime-core/docs/push/README.md) — the registration policy, the record, the triggers
- [docs/session/](../session/README.md) — `useDynamicDeviceId`
