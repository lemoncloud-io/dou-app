import type { ChaosEvent } from '../support/chaos';
import type { Metric } from '../support/evidence';
import { visualResult, type Image, type RunRecord, type ScenarioRecord } from './run';

export const renderEvidence = (run: RunRecord): string => {
    const projects = [...new Set(run.scenarios.map(s => s.project))].sort();
    return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>web-e2e evidence ${esc(run.commit)}</title>
<style>${STYLE}</style></head><body><main>
<header>
  <p class="eyebrow">web-e2e · evidence · ${esc(run.branch)} @ ${esc(run.commit)}</p>
  <h1>Run ${statusPill(run.status === 'passed' ? 'passed' : 'failed')}</h1>
  <p class="muted">${esc(new Date(run.startedAt).toLocaleString('en-GB', { timeZone: 'Asia/Seoul' }))} KST · ${(run.durationMs / 1000).toFixed(0)} s${run.grep && run.grep !== '/.*/' ? ` · grep ${esc(run.grep)}` : ''}</p>
  <div class="tiles">${projects
      .map(p =>
          projectTile(
              p,
              run.scenarios.filter(s => s.project === p)
          )
      )
      .join('')}</div>
</header>
${failuresSection(run.scenarios)}
${visualSection(run)}
${loadSection(run.scenarios, projects)}
${chaosSection(run.scenarios)}
${coverageSection(run)}
${scenariosSection(run.scenarios)}
</main>
<dialog id="zoom"><img alt=""><form method="dialog"><button>Close</button></form></dialog>
<script>document.addEventListener('click',e=>{const i=e.target.closest('img.shot');if(!i)return;const d=document.getElementById('zoom');d.querySelector('img').src=i.src;d.showModal();});</script>
</body></html>`;
};

const projectTile = (project: string, scenarios: ScenarioRecord[]): string => {
    const count = (status: string) => scenarios.filter(s => s.status === status).length;
    const failed = scenarios.filter(s => !s.expected && s.status !== 'skipped' && s.status !== 'flaky').length;
    return `<div class="tile"><b>${esc(project)}</b><span>${count('passed')} passed · ${failed} failed · ${count('flaky')} flaky · ${count('skipped')} skipped</span></div>`;
};

const failuresSection = (scenarios: ScenarioRecord[]): string => {
    const failed = scenarios.filter(s => !s.expected && s.status !== 'skipped');
    if (failed.length === 0) return '';
    return `<section><h2>Failed (${failed.length})</h2><ul class="plain">${failed
        .map(
            s =>
                `<li><a href="#${anchor(s)}">${esc(s.title)}</a> <span class="muted">${esc(s.project)} · ${esc(s.spec)}</span></li>`
        )
        .join('')}</ul></section>`;
};

const visualSection = (run: RunRecord): string => {
    const visual = visualResult(run);
    if (visual.status === 'not-run') return '';
    const diffs = run.scenarios.filter(s => s.tags.includes('@visual') && s.visual.length > 0);
    return `<section><h2>Visual regression ${statusPill(visual.status === 'pass' ? 'passed' : 'failed')}</h2>
<p class="muted">${visual.compared} screens compared against the committed baselines; ${visual.failures.length} differ.</p>
${diffs
    .map(
        s =>
            `<h3>${esc(s.title)} <span class="muted">${esc(s.project)}</span></h3><div class="shots">${s.visual.map(figure).join('')}</div>`
    )
    .join('')}</section>`;
};

const loadSection = (scenarios: ScenarioRecord[], projects: string[]): string => {
    const withMetrics = scenarios.filter(s => s.metrics.length > 0);
    if (withMetrics.length === 0) return '';
    const rows = new Map<
        string,
        {
            scenario: string;
            metric: string;
            unit: Metric['unit'];
            values: Map<string, (number | null)[]>;
            note?: string;
        }
    >();
    for (const s of withMetrics) {
        for (const m of s.metrics) {
            const key = `${s.title}\u0000${m.name}`;
            const row = rows.get(key) ?? {
                scenario: s.title,
                metric: m.name,
                unit: m.unit,
                values: new Map(),
                note: m.note,
            };
            row.values.set(s.project, [...(row.values.get(s.project) ?? []), m.value]);
            if (m.note) row.note = m.note;
            rows.set(key, row);
        }
    }
    const cell = (values: (number | null)[] | undefined, unit: string): string => {
        const numbers = (values ?? []).filter((v): v is number => v !== null).sort((a, b) => a - b);
        if (numbers.length === 0) return '<td class="num muted">n/a</td>';
        const median = numbers[Math.floor((numbers.length - 1) / 2)];
        const range =
            numbers.length > 1
                ? `<small>${fmt(numbers[0])}–${fmt(numbers[numbers.length - 1])} · n=${numbers.length}</small>`
                : '';
        return `<td class="num">${fmt(median)}${unit === 'count' ? '' : ` ${esc(unit)}`}${range}</td>`;
    };
    let lastScenario = '';
    const body = [...rows.values()]
        .map(row => {
            const head = row.scenario === lastScenario ? '' : esc(row.scenario);
            lastScenario = row.scenario;
            return `<tr><td>${head}</td><td>${esc(row.metric)}${row.note ? `<small class="muted">${esc(row.note)}</small>` : ''}</td>${projects
                .map(p => cell(row.values.get(p), row.unit))
                .join('')}</tr>`;
        })
        .join('');
    return `<section><h2>Load</h2><p class="muted">Medians over the repeats in this run. Compare runs on the same machine; these are not budgets.</p>
<div class="scroll"><table><thead><tr><th>Scenario</th><th>Measure</th>${projects.map(p => `<th class="num">${esc(p)}</th>`).join('')}</tr></thead><tbody>${body}</tbody></table></div></section>`;
};

const chaosSection = (scenarios: ScenarioRecord[]): string => {
    const runs = scenarios.filter(s => s.chaos.length > 0);
    if (runs.length === 0) return '';
    return `<section><h2>Chaos</h2><p class="muted">What was broken, when, and what the scenario saw come back. Times are from the start of the scenario.</p>
<div class="grid">${runs
        .map(
            s =>
                `<div class="card"><h3><a href="#${anchor(s)}">${esc(s.title)}</a></h3><p class="muted">${esc(s.project)} · ${statusPill(s.status)}</p>${timeline(s.chaos)}</div>`
        )
        .join('')}</div></section>`;
};

const timeline = (events: ChaosEvent[]): string =>
    `<ol class="timeline">${events
        .map(
            e =>
                `<li class="${e.kind}"><span class="t">${(e.at / 1000).toFixed(1)} s</span><span class="k">${e.kind}</span> ${esc(e.what)}</li>`
        )
        .join('')}</ol>`;

const coverageSection = (run: RunRecord): string => {
    const coverage = run.coverage;
    if (!coverage) return '';
    const resultsBySpec = new Map<string, ScenarioRecord[]>();
    for (const s of run.scenarios) resultsBySpec.set(s.spec, [...(resultsBySpec.get(s.spec) ?? []), s]);
    const chip = (spec: string): string => {
        const results = resultsBySpec.get(spec) ?? [];
        const state =
            results.length === 0
                ? 'not-run'
                : results.some(r => !r.expected && r.status !== 'skipped')
                  ? 'failed'
                  : results.every(r => r.status === 'skipped')
                    ? 'skipped'
                    : 'passed';
        return `<span class="chip ${state}" title="${state}">${esc(spec)}</span>`;
    };
    const covered = coverage.features.length - coverage.uncovered.length;
    return `<section><h2>Feature map</h2><p class="muted">${covered}/${coverage.features.length} web features have a scenario. Chips show this run's result: passed, failed, or not run.</p>
${coverage.problems.length ? `<p class="bad">feature-map.json has drifted: ${coverage.problems.map(esc).join('; ')}</p>` : ''}
<div class="scroll"><table><thead><tr><th>Feature</th><th>Scenarios</th></tr></thead><tbody>${coverage.features
        .map(
            f =>
                `<tr><td>${esc(f.name)}</td><td>${f.specs.length ? f.specs.map(chip).join(' ') : '<span class="muted">no scenario</span>'}</td></tr>`
        )
        .join('')}</tbody></table></div></section>`;
};

const scenariosSection = (scenarios: ScenarioRecord[]): string => {
    const bySpec = new Map<string, ScenarioRecord[]>();
    for (const s of scenarios) bySpec.set(s.spec, [...(bySpec.get(s.spec) ?? []), s]);
    return `<section><h2>Scenarios (${scenarios.length})</h2>${[...bySpec.entries()]
        .map(([spec, list]) => `<h3 class="spec">${esc(spec)}</h3>${list.map(scenarioCard).join('')}`)
        .join('')}</section>`;
};

const scenarioCard = (
    s: ScenarioRecord
): string => `<article id="${anchor(s)}" class="scenario ${s.expected ? '' : 'failed'}">
<div class="row"><span>${statusPill(s.status)}</span><b>${esc(s.title)}</b><span class="muted">${esc(s.project)} · ${(s.durationMs / 1000).toFixed(1)} s${s.retries ? ` · retry ${s.retries}` : ''}${s.repeat ? ` · repeat ${s.repeat + 1}` : ''}${s.tags.length ? ` · ${s.tags.map(esc).join(' ')}` : ''}</span></div>
${s.error ? `<pre class="error">${esc(s.error)}</pre>` : ''}
${s.earlierErrors.length ? `<details><summary>${s.earlierErrors.length} earlier failed attempt(s)</summary><pre class="error">${esc(s.earlierErrors.join('\n\n'))}</pre></details>` : ''}
${s.shots.length ? `<div class="shots">${s.shots.map(figure).join('')}</div>` : ''}
${s.unanswered.length ? `<details><summary>${s.unanswered.length} unanswered requests</summary><pre>${esc(s.unanswered.join('\n'))}</pre></details>` : ''}
</article>`;

const figure = (image: Image): string =>
    `<figure><img class="shot" src="${image.dataUri}" alt="${esc(image.caption)}" loading="lazy"><figcaption>${esc(image.caption)}</figcaption></figure>`;

const statusPill = (status: string): string => {
    const tone = status === 'passed' ? 'ok' : status === 'flaky' || status === 'skipped' ? 'warn' : 'bad';
    return `<span class="pill ${tone}">${esc(status)}</span>`;
};

const anchor = (s: ScenarioRecord): string =>
    `s-${`${s.spec}-${s.line}-${s.project}-${s.repeat}-${s.title}`.replace(/[^a-zA-Z0-9]+/g, '-').slice(0, 120)}`;

const fmt = (n: number): string => (Number.isInteger(n) ? String(n) : n.toFixed(1));

const esc = (text: string): string =>
    text.replace(
        /[&<>"']/g,
        c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] as string
    );

const STYLE = `
:root{--bg:#f5f7f8;--surface:#fff;--fg:#1b2328;--muted:#5b6870;--line:#d6dde1;--accent:#2b6a8a;--ok:#2f7a4f;--ok-soft:#e2f2e8;--warn:#9a5b14;--warn-soft:#f6ead8;--bad:#a3322c;--bad-soft:#f8e3e1;
--sans:system-ui,-apple-system,"Segoe UI",sans-serif;--mono:ui-monospace,Menlo,Consolas,monospace}
@media (prefers-color-scheme:dark){:root{--bg:#11171a;--surface:#182126;--fg:#e3eaee;--muted:#97a6ae;--line:#2b373d;--accent:#7cbfe0;--ok:#79c79a;--ok-soft:#1a2e22;--warn:#e3a660;--warn-soft:#33281a;--bad:#ec8a83;--bad-soft:#3a1f1d;color-scheme:dark}}
body{margin:0;background:var(--bg);color:var(--fg);font:14px/1.55 var(--sans)}
main{max-width:1100px;margin:0 auto;padding:32px max(16px,env(safe-area-inset-left)) 80px;display:flex;flex-direction:column;gap:32px}
h1{margin:0;font-size:26px;display:flex;gap:10px;align-items:center}h2{margin:0 0 8px;font-size:18px;display:flex;gap:8px;align-items:center}h3{margin:16px 0 6px;font-size:14px}
.eyebrow{font:12px var(--mono);letter-spacing:.05em;text-transform:uppercase;color:var(--muted);margin:0 0 4px}
.muted{color:var(--muted)}.bad{color:var(--bad)}small{display:block;font-size:11.5px;color:var(--muted)}
.tiles{display:flex;flex-wrap:wrap;gap:10px;margin-top:12px}.tile{background:var(--surface);border:1px solid var(--line);border-radius:8px;padding:10px 14px;display:flex;flex-direction:column}
.tile span{color:var(--muted);font-size:13px}
.pill{font:600 11.5px var(--mono);padding:1px 8px;border-radius:99px;text-transform:uppercase;letter-spacing:.03em}
.pill.ok{background:var(--ok-soft);color:var(--ok)}.pill.warn{background:var(--warn-soft);color:var(--warn)}.pill.bad{background:var(--bad-soft);color:var(--bad)}
.scroll{overflow-x:auto;border:1px solid var(--line);border-radius:8px;background:var(--surface)}
table{border-collapse:collapse;width:100%;font-size:13px}th,td{text-align:left;vertical-align:top;padding:7px 10px;border-bottom:1px solid var(--line)}
th{font-weight:500;color:var(--muted);background:var(--bg)}tr:last-child td{border-bottom:0}.num{text-align:right;font-variant-numeric:tabular-nums;white-space:nowrap}
.chip{display:inline-block;font:11.5px var(--mono);padding:1px 7px;border-radius:5px;margin:2px 2px 2px 0;border:1px solid var(--line)}
.chip.passed{background:var(--ok-soft);color:var(--ok);border-color:transparent}.chip.failed{background:var(--bad-soft);color:var(--bad);border-color:transparent}.chip.skipped{background:var(--warn-soft);color:var(--warn);border-color:transparent}
.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(320px,1fr));gap:12px}
.card,.scenario{background:var(--surface);border:1px solid var(--line);border-radius:8px;padding:12px 14px;min-width:0}
.card h3{margin:0 0 2px}.card a,.plain a{color:var(--accent)}
.timeline{list-style:none;margin:8px 0 0;padding:0;font-size:12.5px}.timeline li{padding:3px 0 3px 10px;border-left:3px solid var(--line)}
.timeline li.fault{border-color:var(--bad)}.timeline li.heal{border-color:var(--warn)}.timeline li.recovered{border-color:var(--ok)}
.timeline .t{font:12px var(--mono);color:var(--muted);display:inline-block;width:56px}.timeline .k{font:11px var(--mono);text-transform:uppercase;color:var(--muted);display:inline-block;width:80px}
.spec{font:13px var(--mono);color:var(--muted);margin-top:20px}
.scenario{margin:8px 0;display:flex;flex-direction:column;gap:8px}.scenario.failed{border-color:var(--bad)}
.row{display:flex;flex-wrap:wrap;gap:8px;align-items:baseline}
.shots{display:flex;flex-wrap:wrap;gap:10px}figure{margin:0;width:170px}figure img{width:100%;border:1px solid var(--line);border-radius:6px;cursor:zoom-in;background:#fff}
figcaption{font-size:11.5px;color:var(--muted);margin-top:2px}
pre{margin:0;white-space:pre-wrap;word-break:break-word;font:12px var(--mono);background:var(--bg);border-radius:6px;padding:8px}pre.error{color:var(--bad)}
ul.plain{margin:0;padding-left:18px}
dialog{border:0;border-radius:10px;padding:10px;max-width:95vw;max-height:95vh;background:var(--surface)}dialog img{max-height:85vh;max-width:90vw;display:block}dialog::backdrop{background:rgba(0,0,0,.6)}
`;
