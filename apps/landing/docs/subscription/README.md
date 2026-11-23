# Subscription (account surface)

Reasoning behind the rules the account surface (`src/app/features/subscription/`) applies. The screens, routes, port and
server notes are in the app [README](../../README.md); these pages hold the constraints that are easy to break by
"simplifying" the code.

| Page                                                                  | Holds                                                                                               |
| --------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| [Billing rules](./billing-rules.md)                                   | plan changes, card removal, the detail screen's states, calendar days, the payer's fields           |
| [Checkout and session contracts](./checkout-and-session-contracts.md) | how server refusals are read, the sign-in return, the checkout's retry and the lazy port's recovery |
