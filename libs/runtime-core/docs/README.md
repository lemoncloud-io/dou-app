# runtime-core docs

What belongs here is how the runtime's assembly behaves, where it is more than a section of
[the README](../README.md).

| Category                              | Holds                                                                                                                                                       |
| ------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [data/](./data/README.md)             | the repository graph: `DataManager`, the factories, scoped graphs, outboxes, invited and paired clouds; the page's graph and the engine's `data`            |
| [session/](./session/README.md)       | the session controller (boot, guest keep-alive), the relay and cloud credential guards, the foreground port they wait on, the session view and the commands |
| [push/](./push/README.md)             | push device-token registration: the delegate contract, the once-per-install record, the triggers                                                            |
| [bridge/](./bridge/README.md)         | the runtime across the bridge: who owns the session each launch, the contract version, the messages, errors                                                 |
| [connection/](./connection/README.md) | the connection controller: the slots it derives from the session, the two binders, background slots and write holds; the sockets as screens read them       |
