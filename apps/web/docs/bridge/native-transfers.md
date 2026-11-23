# native transfers — uploads and downloads that survive the page

`app/runtime/upload/` and `app/runtime/transfer/` move bytes through the native shell's transfer module so
a transfer keeps going while the app is in the background. The port wiring and the consumers are in
[README.md](./README.md#file-transfers-shellupload); this page is why the senders look the way they do.

The shell only moves bytes and reports a terminal state. Every transfer here is the same shape: register a
waiter, start the transfer, wait for its one terminal state, acknowledge it so the shell can drop the record
it keeps for a page that might have missed the event. The waiter is registered **before** the start request,
because the first state event can arrive before the start's reply does.

## Uploads — `nativePut.ts`

- **Only images go through the shell from the page.** The bytes cross the bridge once, as base64 in a temp
  file write, before the shell streams them from disk. A page video or document would have to travel whole as
  base64 in one message, which a WebView does not survive for a 300 MB file, so those use the page's own PUT,
  which streams the picked file from disk at the cost of stopping with the page. A file the shell already
  keeps is sent without that step.
- **One temp-file write at a time.** Uploads run in parallel, but each write holds the whole file as base64 in
  page memory and again in the bridge message; three 20 MB photos at once can take a WebView down.
- **The write has a long timeout** (`WRITE_TEMP_FILE_TIMEOUT_MS` = 120 s): the default request timeout is sized
  for small commands, and a 20 MB photo is about 27 MB of base64.
- **The shell never judges a response.** Any HTTP status arrives as `responded` and only transfers with no
  response at all are `failed`. `cancelled` can only come from the OS; nothing in the app cancels uploads.
- A failure to read the file, or a temp-file write failing with `SOURCE`, is a local-file problem and is not
  retried as a system one; iOS refuses a source that is gone at start, Android fails once it reads it, and
  both are the same lost file. The shell requires the content length and rejects a start without it.
- Progress is reported as the shell reports bytes (at most every 200 ms) and dropped with the waiter, so
  nothing is counted after the transfer settles. Unacknowledged results are held by the shell only until its
  cap evicts them, so a failed acknowledge is logged and not fatal.

## Catching up after the page was away — `transferSync.ts`

A terminal state announced while the page was reloaded or suspended was never heard, and the shell holds it
until acknowledged. The catch-up reads what the shell holds and:

- settles the uploads this page still waits on, then acknowledges every ended transfer;
- **drops an ended transfer this page does not know.** It belongs to a page that no longer exists, and the
  message it was for lived only in that page's memory, so nothing could send it;
- **settles a transfer this page waits on that the shell no longer holds as a system failure.** It was lost
  to the shell's cap or its own state, and without this its message would stay "sending" for good. Only
  transfers the shell accepted before the list was asked for can be judged missing, since a waiter exists
  before the shell has replied to its start;
- leaves running transfers alone (their event is still to come) and leaves downloads to their own reader,
  which acknowledges only after the file has been saved or shared.

A failed list request changes nothing; the next catch-up asks again.

## Downloads — `nativeGet.ts`

A download that brought a file is acknowledged by the caller once the file has been used; one that brought
none is acknowledged here at once. Acknowledging drops the shell's record only, never the file.

- **A stall window, `DOWNLOAD_STALL_MS` = 30 s without a byte**, matching the shell's own window for closing the
  iOS upload progress UI. iOS keeps a download whose connection dropped in `running` and retries in the
  background for as long as days, so without a window here the button would never come back. The window starts
  when the shell accepts the start and restarts whenever bytes advance.
- **A stall is checked against the shell before cancelling.** On iOS the page's timers keep counting while the
  app is suspended, so a download that finished in the background meets an expired timer on return ahead of
  its own terminal event. The check asks where the download really is; one that ended or moved is settled by
  the ordinary rules, and only a still-idle one is cancelled.
- **A download the page gave up on is still acknowledged when its terminal state arrives**, since nothing else
  will. A start refused outright (`NOT_FOUND`, `INVALID`) will not be followed by a state; a start that got no
  answer (a timeout while an OS prompt holds the shell up) may still have begun, so it is cancelled and its
  eventual state acknowledged.
- Its catch-up settles waiting downloads from what the shell holds, treats an accepted download the shell no
  longer lists as a system failure, and acknowledges ended downloads nobody waits for (left by a page before a
  reload). It does not touch uploads.
