# runtime-core docs

What belongs here is how the runtime's assembly behaves, where it is more than a section of
[the README](../README.md).

| Category                              | Holds                                                                                                                     |
| ------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| [data/](./data/README.md)             | the repository graph: `DataManager`, the factories, scoped graphs, outboxes, invited and paired clouds                    |
| [session/](./session/README.md)       | the session controller: bringing the relay session up at boot, the guest keep-alive, and the foreground port they wait on |
| [connection/](./connection/README.md) | the connection controller: the slots it derives from the session, the two binders, background slots and write holds       |
