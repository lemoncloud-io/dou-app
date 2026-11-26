use std::collections::VecDeque;
use std::time::{Duration, Instant};

use crate::settings::RateLimit;

#[derive(Debug, Default)]
pub struct Limiter {
    minute: VecDeque<Instant>,
    hour: VecDeque<Instant>,
}

fn trim(window: &mut VecDeque<Instant>, now: Instant, span: Duration) {
    while let Some(front) = window.front() {
        if now.duration_since(*front) >= span {
            window.pop_front();
        } else {
            break;
        }
    }
}

impl Limiter {
    pub fn try_acquire(&mut self, limit: RateLimit, now: Instant) -> bool {
        trim(&mut self.minute, now, Duration::from_secs(60));
        trim(&mut self.hour, now, Duration::from_secs(3600));
        if self.minute.len() >= limit.per_minute as usize
            || self.hour.len() >= limit.per_hour as usize
        {
            return false;
        }
        self.minute.push_back(now);
        self.hour.push_back(now);
        true
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    const LIMIT: RateLimit = RateLimit {
        per_minute: 2,
        per_hour: 3,
    };

    #[test]
    fn the_third_write_inside_a_minute_is_refused_and_a_minute_later_it_passes() {
        let mut limiter = Limiter::default();
        let start = Instant::now();
        assert!(limiter.try_acquire(LIMIT, start));
        assert!(limiter.try_acquire(LIMIT, start + Duration::from_secs(1)));
        assert!(!limiter.try_acquire(LIMIT, start + Duration::from_secs(2)));
        assert!(limiter.try_acquire(LIMIT, start + Duration::from_secs(61)));
    }

    #[test]
    fn the_hourly_cap_holds_even_when_the_minute_window_is_free() {
        let mut limiter = Limiter::default();
        let start = Instant::now();
        for minute in 0..3 {
            assert!(limiter.try_acquire(LIMIT, start + Duration::from_secs(minute * 120)));
        }
        assert!(!limiter.try_acquire(LIMIT, start + Duration::from_secs(400)));
        assert!(limiter.try_acquire(LIMIT, start + Duration::from_secs(3601)));
    }

    #[test]
    fn a_refused_write_does_not_use_up_the_budget() {
        let mut limiter = Limiter::default();
        let start = Instant::now();
        assert!(limiter.try_acquire(LIMIT, start));
        assert!(limiter.try_acquire(LIMIT, start));
        for _ in 0..5 {
            assert!(!limiter.try_acquire(LIMIT, start));
        }
        assert!(limiter.try_acquire(LIMIT, start + Duration::from_secs(60)));
    }
}
