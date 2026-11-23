# Push, purchases and updates

Source: `notification.ts`, `iap.ts`, `update.ts`, `app-update.ts`, `unfurl.ts`. See the [index](./README.md)
for conventions.

## Notifications and badge

- **`FetchFcmToken`** (web→native) — the device's FCM token (`token`).
- **`DeleteFcmToken`** — delete it. Exists so the re-registration path can be exercised: `FetchFcmToken` is
  read-only and cannot stand in for it (debug panel).
- **`OnReceiveNotification`** (native→web push) — a notification was received or opened; carries
  `notification` (`title`, `body`, free-form `data`).
- **`FetchBadgeCount`** — the badge count as notifee reports it. notifee's badge API is iOS-only, so the answer
  is always 0 elsewhere.
- **`FetchBadgeBase`** — the native shared counter, i.e. the store that actually holds the count on Android.
  A separate message from `FetchBadgeCount` because the web ships ahead of the app: an older shell answers
  `NOT_FOUND`, and the web reads that as "unknown on this shell". Changing the existing message's meaning would
  make that distinction impossible. `base: null` means "unknown on this platform"; answering 0 would let a
  consumer compare it as a real value.
- **`SetBadgeCount`** — set the badge to `count`. `overlayIconDataUrl` is optional and Windows-only: a PNG data
  URL for the taskbar overlay icon, because Windows has no dock badge and Electron's `nativeImage` cannot draw
  SVG, so the renderer draws it to PNG (canvas) and passes it in. Ignored on macOS and Linux.
- **`ShowNotification`** (since 2.2.0) — ask the shell to show an OS notification (`title`, `body`, optional
  `channelId` and `deeplink`). Used by the desktop, which has no FCM: when a live WebSocket sees a new message the
  web asks the shell to notify.
- **`FetchPushMarks`** — drain the native store of cross-cloud push marks; the store is emptied as the reply is
  produced. A mark is a raw hint for one cross-cloud push that arrived while the app was backgrounded or
  terminated (`cid`, `uid`, `channelId`, `sid`, `channelName`). Native does not interpret the fields and stores
  them as is, including the relay sentinel `cid` of `'#'` and the deployment backend's empty string; the single
  place that decides what they mean is `resolvePushCloudId` on the web.

## In-app purchases

- **`FetchProducts`** (web→native) — subscription products as `IapProductSubscription`, unified across iOS and
  Android. `id` is the product id actually used for the purchase; `basePlanId` is Android only (the sub-plan under
  the product). `displayPrice` is formatted (`₩10,000`). `billingPeriod` is ISO 8601 (`P1M`, `P1Y`);
  `periodUnit` and `periodNumber` give the same as unit and count. `androidOfferToken` (Android only) holds the
  offer tokens `freeTrial` and `base` and is required there because the offer must be chosen by free-trial
  eligibility.
- **`FetchCurrentPurchases`** — the purchase history.
- **`Purchase`** — start a purchase. `id` is the SKU (iOS: the product id; Android: the top-level product id).
  `offerToken` is required on Android (it carries the free-trial and plan choice). `oldPlanId` is the plan being
  left and `newPlanId` the plan being bought, both Android only (`basePlanId`s), used for upgrade/downgrade and
  tier comparison. The reply `OnPurchase` only acknowledges that the flow started. The **outcome** arrives later
  and unprompted as the native→web pushes `OnPurchaseSuccess` (`purchase`) or `OnPurchaseError` (`error`).
- **`FinishPurchaseTransaction`** — tell the store the purchase was processed. Skipping this after processing a
  purchase results in a refund.
- **`OpenSubscriptionManagement`** — open the store's subscription management screen.

## Desktop auto-update

Desktop only (electron-updater). Since the shell cannot ask the user, the web asks after consent.

- **`OnUpdateStatus`** (native→web push) — `status` is `available`, `downloading`, `downloaded` or `error`;
  `version`, `percent` (0-100 when downloading) and `message` (human-readable when `error`) are filled in by status.
- **`StartUpdateDownload`** (web→native) — start the download; progress and result arrive via `OnUpdateStatus`.
  The reply `success` only says the request was accepted.
- **`RestartToUpdate`** — restart to apply the update. The app quits immediately (`quitAndInstall`), so the reply
  is usually never delivered.

## Phone store update

- **`CheckAppUpdate`** (web→native) — on demand (mount / foreground) the shell resolves the live store version
  (iOS only for now) and replies with `platform`, `currentVersion`, `latestVersion`, `updateAvailable` and
  `storeUrl`. `forceUpdate` is reserved for a future forced-update flow and unused today.
- **`OpenStore`** — navigate to the platform's store listing.

## Link preview

- **`FetchUrlMetadata`** (web→native) — fetch `og:` metadata for a URL (`title`, `description`, `siteName`,
  `imageUrl`). The desktop shell's main process does the fetching because the renderer cannot read external pages
  (CORS). `success: false` means no preview, which is a candidate for negative caching. Only https image URLs are
  returned: binary data does not go over IPC.
