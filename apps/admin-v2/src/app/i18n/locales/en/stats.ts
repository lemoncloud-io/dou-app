import type { stats as ko } from '../ko/stats';

/** English copy for the statistics tab. */
export const stats: typeof ko = {
    goals: {
        title: 'Against targets',
        hint: 'Speed measured against its target, from the measurements recorded in the period.',
    },
    goal: {
        boot: { name: 'App start', what: 'From tapping the app to the first screen being ready' },
        roomEntry: { name: 'Room entry', what: 'From tapping a room to its messages showing' },
        switch: { name: 'Cloud and place switch', what: 'From tapping switch to it finishing' },
        fcp: { name: 'First contentful paint (FCP)', what: 'Until the web first paints anything' },
        lcp: { name: 'Largest contentful paint (LCP)', what: 'Until the largest content shows' },
    },
    verdict: { met: 'Within target', missed: 'Over target', none: 'No target', noData: 'No records' },
    card: {
        atTarget: '{{p}}% within this · target {{target}}',
        atNoTarget: '{{p}}% within this',
        sample: '{{n}} records · median {{median}}',
        noData: 'No records in this period',
        partial: 'from part of the recent records',
    },
    off: {
        title: 'No statistics in this period',
        why: 'The apps collect statistics at set rates. Only runs that meet the conditions below are recorded — check them, or widen the period.',
        where: 'Collected from: the iOS and Android apps 0.29.2 and later, and the web in a browser. Older apps and the desktop app collect none.',
        rates: 'Rates: records with a target (app start, switches, FCP, LCP), room entry and usage from every run; other performance records from about one run in five.',
        firstRun: 'The first run after a fresh install is skipped; collection starts from the next run.',
    },
    usage: {
        wideSpan: 'The server counts whole days only, so usage covers {{from}} 00:00 to {{to}}.',
        failed: "Couldn't load usage: {{message}}",
        title: 'Usage',
        users: 'Users',
        opens: 'App opens',
        records: 'All records',
        daily: 'Users per day',
        usersOn: 'Users: {{count}}',
        note: 'User counts are the server’s estimate of people who left records; days are by arrival time, Korean time.',
        unsupported: "The server doesn't aggregate usage yet",
        unsupportedHint: 'It will show here once the server has the aggregation.',
    },
};
