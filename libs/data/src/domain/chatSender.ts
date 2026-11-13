/**
 * Whether a message came in through the webhook endpoint (`stereo: 'webhook'`) — an integration's
 * post, with the card its sender described in `blocks$` — as opposed to one a person wrote.
 *
 * Both apps ask it of the same field, for two things: whether the message is drawn as a card, and
 * how its sender is drawn (no profile to open, no roster to name it, never "mine").
 *
 * The second is a question about the sender's account, and belongs with that account's own record
 * (`stereo: 'system'`) looked up by `ownerId`. The client cannot do that yet: the webhook account is
 * not a channel member, so the member sync never brings it into the user cache, and the server has
 * no call to read a user by id. Until it does, the message's own `stereo` answers for its sender —
 * true of every webhook post today, since all of them are sent by that one system account.
 *
 * Takes the field structurally rather than as `DomainChat`: a push payload asks the same question
 * with only some of a chat's fields, and `stereo` there is a plain string.
 */
export const isWebhookChat = (chat: { stereo?: string }): boolean => chat.stereo === 'webhook';
