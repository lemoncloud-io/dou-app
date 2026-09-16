# release — getting a build out, and pointing one at a server

Everything about the app as a *shipped artifact*: how it is built and uploaded, how a running copy
learns it is out of date, and how a developer points the shell at a local web dev server instead of
a deployed one.

A document belongs here if it is about the build or its environment, not about what the app does
once it is running. The env-to-`Env` conversion is described here because the environment is a
release concern; the runtime that consumes it is in [../webview/README.md](../webview/README.md).

| Document | Owns |
| --- | --- |
| [deploy.md](./deploy.md) | The local-Mac build-and-upload pipeline for four store apps, and what stays a human decision |
| [app-update.md](./app-update.md) | `VersionService` — the live-version lookup, the boot alert, and the web update dialog |
| [local-run.md](./local-run.md) | Running the shell against `apps/web`'s dev server, and the `.env` contract behind it |

`app-update.md` is the shell half of the update story. The web half — what the web client does when
the shell reports an update — is `apps/web/docs/feature/appUpdate/`.
