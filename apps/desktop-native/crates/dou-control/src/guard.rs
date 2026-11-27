use std::time::Instant;

use crate::limiter::Limiter;
use crate::settings::{Settings, Tier};

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Client {
    Mcp,
    Cli,
    App,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum Action<'a> {
    Read,
    Write { channel_id: &'a str },
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Denial {
    pub code: &'static str,
    pub message: String,
}

fn deny(code: &'static str, message: impl Into<String>) -> Result<(), Denial> {
    Err(Denial {
        code,
        message: message.into(),
    })
}

pub fn authorize(
    client: Client,
    settings: &Settings,
    action: &Action<'_>,
    limiter: &mut Limiter,
    now: Instant,
) -> Result<(), Denial> {
    if client == Client::App {
        return match action {
            Action::Read => Ok(()),
            Action::Write { .. } => deny("app_cannot_write", "The app handle only reads."),
        };
    }
    match (settings.tier, action) {
        (Tier::Off, _) => deny(
            "tier_off",
            "MCP access is off. The owner turns it on from the app, never through MCP.",
        ),
        (_, Action::Read) => Ok(()),
        (Tier::Read, Action::Write { .. }) => deny(
            "tier_read_only",
            "The permission tier is read only, so writes are refused.",
        ),
        (Tier::Write | Tier::Full, Action::Write { channel_id }) => {
            if !settings.allows_room(channel_id) {
                return deny(
                    "room_not_allowed",
                    format!("Room {channel_id} is not on the allow-list, so nothing was sent."),
                );
            }
            if !limiter.try_acquire(settings.rate_limit, now) {
                return deny(
                    "rate_limited",
                    "Too many writes. Wait before sending again.",
                );
            }
            Ok(())
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::settings::RateLimit;

    fn settings(tier: Tier, rooms: &[&str]) -> Settings {
        Settings {
            tier,
            allow_rooms: rooms.iter().map(ToString::to_string).collect(),
            rate_limit: RateLimit {
                per_minute: 1,
                per_hour: 10,
            },
        }
    }

    fn check(
        client: Client,
        settings: &Settings,
        action: &Action<'_>,
        limiter: &mut Limiter,
    ) -> Result<(), &'static str> {
        authorize(client, settings, action, limiter, Instant::now()).map_err(|d| d.code)
    }

    #[test]
    fn off_refuses_everything_for_mcp() {
        let s = settings(Tier::Off, &["r"]);
        let mut l = Limiter::default();
        assert_eq!(
            check(Client::Mcp, &s, &Action::Read, &mut l),
            Err("tier_off")
        );
        assert_eq!(
            check(Client::Mcp, &s, &Action::Write { channel_id: "r" }, &mut l),
            Err("tier_off")
        );
    }

    #[test]
    fn read_allows_reads_and_refuses_writes_even_in_an_allowed_room() {
        let s = settings(Tier::Read, &["r"]);
        let mut l = Limiter::default();
        assert_eq!(check(Client::Mcp, &s, &Action::Read, &mut l), Ok(()));
        assert_eq!(
            check(Client::Mcp, &s, &Action::Write { channel_id: "r" }, &mut l),
            Err("tier_read_only")
        );
    }

    #[test]
    fn write_needs_the_room_on_the_allow_list() {
        let s = settings(Tier::Write, &["r"]);
        let mut l = Limiter::default();
        assert_eq!(
            check(
                Client::Mcp,
                &s,
                &Action::Write {
                    channel_id: "other"
                },
                &mut l
            ),
            Err("room_not_allowed")
        );
        assert_eq!(
            check(Client::Mcp, &s, &Action::Write { channel_id: "r" }, &mut l),
            Ok(())
        );
    }

    #[test]
    fn full_is_still_held_to_the_allow_list_and_the_rate_limit() {
        let s = settings(Tier::Full, &["r"]);
        let mut l = Limiter::default();
        assert_eq!(
            check(
                Client::Mcp,
                &s,
                &Action::Write { channel_id: "nope" },
                &mut l
            ),
            Err("room_not_allowed")
        );
        let now = Instant::now();
        assert!(
            authorize(
                Client::Mcp,
                &s,
                &Action::Write { channel_id: "r" },
                &mut l,
                now
            )
            .is_ok()
        );
        let second = authorize(
            Client::Mcp,
            &s,
            &Action::Write { channel_id: "r" },
            &mut l,
            now,
        );
        assert_eq!(second.unwrap_err().code, "rate_limited");
    }

    #[test]
    fn a_refused_write_in_a_wrong_room_does_not_spend_the_rate_budget() {
        let s = settings(Tier::Write, &["r"]);
        let mut l = Limiter::default();
        let now = Instant::now();
        assert!(
            authorize(
                Client::Mcp,
                &s,
                &Action::Write { channel_id: "x" },
                &mut l,
                now
            )
            .is_err()
        );
        assert!(
            authorize(
                Client::Mcp,
                &s,
                &Action::Write { channel_id: "r" },
                &mut l,
                now
            )
            .is_ok()
        );
    }

    #[test]
    fn the_app_handle_reads_even_when_off_and_never_writes() {
        let s = settings(Tier::Off, &["r"]);
        let mut l = Limiter::default();
        assert_eq!(check(Client::App, &s, &Action::Read, &mut l), Ok(()));
        assert_eq!(
            check(Client::App, &s, &Action::Write { channel_id: "r" }, &mut l),
            Err("app_cannot_write")
        );
    }

    #[test]
    fn the_command_line_is_held_to_the_same_gate_as_mcp() {
        let mut l = Limiter::default();
        let write = Action::Write { channel_id: "r" };
        assert_eq!(
            check(Client::Cli, &settings(Tier::Off, &["r"]), &write, &mut l),
            Err("tier_off")
        );
        assert_eq!(
            check(Client::Cli, &settings(Tier::Read, &["r"]), &write, &mut l),
            Err("tier_read_only")
        );
        assert_eq!(
            check(Client::Cli, &settings(Tier::Write, &[]), &write, &mut l),
            Err("room_not_allowed")
        );
    }
}
