# desktop-web docs

How `apps/desktop-web` behaves now — the web client the Electron shell (`apps/desktop`) loads. Build,
run and deploy commands are in the root [`README.md`](../../../README.md); decisions and their cost
are in [`docs/adr/`](../../../docs/adr/).

## Categories

| Category                   | What belongs there                                                                      |
| -------------------------- | --------------------------------------------------------------------------------------- |
| [`auth/`](./auth/)         | How a person gets signed in, and what the app refuses to take as a sign-in              |
| [`chat/`](./chat/)         | The home screen's conversation surfaces: the sidebar lists, 1:1s, the room and composer |
| [`shell/`](./shell/)       | The frame around the conversation: rails, sidebar drawer, trailing panels, stacking     |
| [`settings/`](./settings/) | The Settings page: appearance, notifications, About and reporting a problem             |

A document goes in the category whose name answers "is this about that?" on its own. A topic that
fits none of them is a new category with its own `README.md`, not a file directly in this folder.
