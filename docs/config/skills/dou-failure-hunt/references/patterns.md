# Failure patterns

| Pattern                        | Search                                                                         | Why it hurts                           |
| ------------------------------ | ------------------------------------------------------------------------------ | -------------------------------------- |
| await with no timeout          | `await` on a request or send with no `timeout` or `AbortSignal` nearby         | one lost reply freezes a flow forever  |
| retry without a cap or backoff | `while (true)`, `retry`, `setTimeout(.*retry`                                  | hammers the server, drains the battery |
| timer never cleared            | `setInterval(` in a hook without the matching `clearInterval` in cleanup       | leaks and double work after remount    |
| subscription never removed     | `.on(`, `addEventListener(`, `subscribe(` without `off`/`remove`/`unsubscribe` | handlers pile up per reconnect         |
| swallowed error                | `catch {}`, `catch (e) {}`, `.catch(() => undefined)`                          | failure becomes silent wrong state     |
| unbounded queue or cache       | `push(` onto module-level arrays, `Map` caches with no eviction                | memory growth over a long session      |
| race on async state            | `useEffect` that sets state after an `await` with no cancel flag               | stale data overwrites newer data       |
| order assumption               | code assuming replies arrive in send order                                     | out-of-order replies corrupt state     |
| single point of boot           | boot steps awaited in series with no fallback                                  | one slow call blocks the whole app     |

Use `git grep -n -E '<pattern>' -- libs apps` and read each match in context before listing it.
