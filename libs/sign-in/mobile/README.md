# @chatic/sign-in-mobile

**Social sign-in for a React Native app: Google and Apple through their native SDKs**
(`@react-native-google-signin/google-signin`, `@invertase/react-native-apple-authentication`). The
result is `@chatic/ports`' `SignInToken`, the same shape the shell hands the web for a provider sign-in.
An app with no social sign-in installs neither SDK
([ADR-0375](../../../docs/adr/0375-platform-implementations-live-in-libs-as-families-of-one-port.md)).

Tags: `layer:adapter` · `platform:mobile` · `formfactor:any`.

```ts
import { OAuthService } from '@chatic/sign-in-mobile';

const signIn = new OAuthService(logger, { googleWebClientId });
const token = await signIn.login('google'); // null when the person cancels
```

An app that installs this package lists both SDKs in its own `package.json` so React Native autolinks
them. The mobile app reads the Google web client id in `apps/mobile/src/config/families.ts`.

| Export                          | Does                                                                   |
| ------------------------------- | ---------------------------------------------------------------------- |
| `OAuthService(logger, options)` | configures Google sign-in once, then `login` and `logout` per provider |
| `OAuthServiceOptions`           | `googleWebClientId`, the OAuth client the id token is issued for       |

## Rules

- **`login` resolves `null` only when the person cancels** (Google's cancelled result, Apple's
  `CANCELED` code). Every genuine failure throws, so the bridge reports it as `success: false`
  (`OAUTH_LOGIN_ERROR`) instead of the cancel-shaped `result: null` that the web reads as a dismissal.
  A new provider must keep that split: a failure that returns `null` is invisible to the web.
- **Google signs out before every sign-in.**
- **Apple's sign-out is a no-op**: Apple has no session on the device to end.
