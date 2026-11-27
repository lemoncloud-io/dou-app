use std::time::Instant;

use crate::limiter::Limiter;
use crate::settings::{Settings, Tier};

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Client {
    Mcp,
    Cli,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum Action<'a> {
    Read,
    ReadRoom { channel_id: &'a str },
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
    if client == Client::Cli {
        return Ok(());
    }
    match (settings.tier, action) {
        (Tier::Off, _) => deny(
            "tier_off",
            "MCP access is off. The owner turns it on from the app, never through MCP.",
        ),
        (_, Action::Read) => Ok(()),
        (_, Action::ReadRoom { channel_id }) => {
            if settings.allows_room(channel_id) {
                Ok(())
            } else {
                deny(
                    "room_not_allowed",
                    format!("Room {channel_id} is not on the allow-list, so it was not read."),
                )
            }
        }
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
    fn reading_a_room_needs_a_tier_above_off_and_the_room_on_the_allow_list() {
        let mut l = Limiter::default();
        let room = Action::ReadRoom { channel_id: "r" };
        let other = Action::ReadRoom { channel_id: "x" };
        assert_eq!(
            check(Client::Mcp, &settings(Tier::Off, &["r"]), &room, &mut l),
            Err("tier_off")
        );
        for tier in [Tier::Read, Tier::Write, Tier::Full] {
            let s = settings(tier, &["r"]);
            assert_eq!(check(Client::Mcp, &s, &room, &mut l), Ok(()));
            assert_eq!(
                check(Client::Mcp, &s, &other, &mut l),
                Err("room_not_allowed")
            );
        }
    }

    #[test]
    fn a_room_read_never_spends_the_write_budget() {
        let s = settings(Tier::Write, &["r"]);
        let mut l = Limiter::default();
        let now = Instant::now();
        for _ in 0..5 {
            assert!(
                authorize(
                    Client::Mcp,
                    &s,
                    &Action::ReadRoom { channel_id: "r" },
                    &mut l,
                    now
                )
                .is_ok()
            );
        }
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
    fn the_local_command_line_is_the_owner_and_is_not_gated() {
        let s = settings(Tier::Off, &[]);
        let mut l = Limiter::default();
        assert_eq!(
            check(
                Client::Cli,
                &s,
                &Action::Write { channel_id: "any" },
                &mut l
            ),
            Ok(())
        );
    }
}
