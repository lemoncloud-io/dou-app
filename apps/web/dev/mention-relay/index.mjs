import { createMentionRelay } from './relay.mjs';

export function mentionRelayPlugin(configPath = process.env.DOU_MENTION_RELAY_CONFIG) {
    return {
        name: 'dou-local-mention-relay',
        apply: 'serve',
        configureServer(server) {
            if (configPath) server.middlewares.use(createMentionRelay(configPath));
        },
    };
}
