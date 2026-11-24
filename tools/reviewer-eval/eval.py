#!/usr/bin/env python3
import argparse, json, os, re, shutil, subprocess, sys
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

SRC = Path(os.environ.get('EVAL_SRC_REPO', Path(__file__).resolve().parents[2])).resolve()
if not os.environ.get('EVAL_ROOT'):
    sys.exit('Set EVAL_ROOT to a directory outside the repository.')
ROOT = Path(os.environ['EVAL_ROOT']).resolve()
if ROOT == SRC or SRC in ROOT.parents:
    sys.exit(f'EVAL_ROOT must be outside {SRC}.')
HISTORY_DEPTH = 50
HARNESS_REF = os.environ.get('EVAL_HARNESS_REF', 'origin/develop')
HARNESS_PATHS = ['REVIEW.md', 'AGENTS.md', 'CLAUDE.md', '.claude/agents', '.claude/skills', 'docs/config/skills']
DROP_PATHS = ['.claude/settings.json']
MANIFEST = json.loads((Path(__file__).resolve().parent / 'cases.json').read_text())
CASES = {c['id']: dict(c, kind='defect', group='design') for c in MANIFEST['defects']}
CASES.update({c['id']: dict(c, kind='defect', group='holdout') for c in MANIFEST.get('holdout', [])})
CASES.update({c['id']: dict(c, kind='control') for c in MANIFEST['controls']})

def sh(*a, cwd=None, env=None, inp=None, check=True):
    r = subprocess.run(a, cwd=cwd, env=env, input=inp, capture_output=True, text=True)
    if check and r.returncode:
        raise RuntimeError(f"{a}: {r.stderr[:2000]}")
    return r.stdout

def branch_of(sha):
    since = sh('git', 'log', '-1', '--format=%cI', sha, cwd=SRC).strip()
    merges = sh('git', 'log', '--first-parent', '--merges', '--reverse', f'--since={since}', '--format=%H %s',
                HARNESS_REF, cwd=SRC).splitlines()
    for line in merges:
        m, subj = line.split(' ', 1)
        if subprocess.run(['git', 'merge-base', '--is-ancestor', sha, m], cwd=SRC).returncode == 0:
            hit = re.search(r'from [\w.-]+/(\S+)', subj)
            return hit.group(1) if hit else 'change/' + sha[:9]
    return 'change/' + sha[:9]

def build(cid, tag, review_file):
    c = CASES[cid]
    d = ROOT / 'cases' / tag / cid
    if d.exists():
        shutil.rmtree(d)
    repo, origin = d / 'repo', d / 'origin.git'
    repo.mkdir(parents=True)
    sh('git', 'init', '-q', '-b', 'review', str(repo))
    sh('git', 'init', '-q', '--bare', str(origin))
    g = lambda *a, **k: sh('git', *a, cwd=repo, **k)
    head = sh('git', 'rev-parse', c['commit'] + '^{commit}', cwd=SRC).strip()
    g('fetch', '-q', '--no-tags', f'--depth={HISTORY_DEPTH + 1}', f'file://{SRC}', head)
    base = g('rev-parse', head + '^').strip()
    harness = sh('git', 'rev-parse', HARNESS_REF, cwd=SRC).strip()
    listing = sh('git', 'ls-tree', '-r', harness, '--', *HARNESS_PATHS, cwd=SRC)
    for line in listing.splitlines():
        blob = line.split()[2]
        data = subprocess.run(['git', 'cat-file', 'blob', blob], cwd=SRC, capture_output=True, check=True).stdout
        subprocess.run(['git', 'hash-object', '-w', '--stdin'], cwd=repo, input=data, capture_output=True, check=True)
    env = dict(os.environ, GIT_INDEX_FILE=str(d / 'idx'))
    g('read-tree', base, env=env)
    for p in DROP_PATHS:
        g('update-index', '--force-remove', p, env=env)
    for p in HARNESS_PATHS:
        g('rm', '-r', '--cached', '-q', '--ignore-unmatch', p, env=env)
    g('update-index', '--index-info', env=env, inp=listing)
    if review_file:
        blob = g('hash-object', '-w', str(Path(review_file).resolve())).strip()
        g('update-index', '--cacheinfo', f'100644,{blob},REVIEW.md', env=env)
    htree = g('write-tree', env=env).strip()
    ident = dict(env, GIT_AUTHOR_NAME='eval', GIT_AUTHOR_EMAIL='eval@example.invalid',
                 GIT_COMMITTER_NAME='eval', GIT_COMMITTER_EMAIL='eval@example.invalid',
                 GIT_AUTHOR_DATE=g('log', '-1', '--format=%aI', base).strip(),
                 GIT_COMMITTER_DATE=g('log', '-1', '--format=%cI', base).strip())
    hcommit = g('commit-tree', htree, '-p', base, '-m', 'chore: review harness for this evaluation', env=ident).strip()
    excl = [f':!{p}' for p in HARNESS_PATHS + DROP_PATHS]
    patch = g('diff', '--binary', '--no-renames', base, head, '--', '.', *excl)
    if patch.strip():
        g('apply', '--cached', '--whitespace=nowarn', '-', env=env, inp=patch)
    ptree = g('write-tree', env=env).strip()
    msg = g('log', '-1', '--format=%B', head)
    msg = '\n'.join(l for l in msg.splitlines() if not l.lower().startswith('co-authored-by'))
    penv = dict(env, GIT_AUTHOR_NAME=g('log', '-1', '--format=%an', head).strip(),
                GIT_AUTHOR_EMAIL='author@example.invalid', GIT_COMMITTER_NAME='eval',
                GIT_COMMITTER_EMAIL='eval@example.invalid',
                GIT_AUTHOR_DATE=g('log', '-1', '--format=%aI', head).strip(),
                GIT_COMMITTER_DATE=g('log', '-1', '--format=%cI', head).strip())
    pcommit = g('commit-tree', ptree, '-p', hcommit, '-m', msg, env=penv).strip()
    (origin / 'objects/info/alternates').write_text(str(repo / '.git/objects') + '\n')
    sh('git', 'update-ref', 'refs/heads/develop', hcommit, cwd=origin)
    g('remote', 'add', 'origin', str(origin))
    g('update-ref', 'refs/remotes/origin/develop', hcommit)
    branch = branch_of(head)
    g('update-ref', f'refs/heads/{branch}', pcommit)
    g('checkout', '-q', '-f', branch)
    g('branch', '-D', 'review', check=False)
    g('update-ref', '-d', 'FETCH_HEAD', check=False)
    (d / 'idx').unlink(missing_ok=True)
    checklist = g('show', f'{hcommit}:REVIEW.md', check=False)
    (d / 'meta.json').write_text(json.dumps({'id': cid, 'commit': head, 'base': base, 'harness': hcommit,
                                             'review': pcommit, 'msg': msg, 'checklist': checklist}, indent=1))
    return cid

STAGES = """Structure your answer in exactly these three sections, with these headings:

## 1. First pass
Every problem you suspect after reading the diff, the touched modules' docs and the fired REVIEW.md items, before you
check any of them further. One line each with file:line.

## 2. Verification
For each first-pass item: what you checked (code read, grep, git history, test) and the verdict — confirmed, refuted
or unverified. Add any problem you found only while verifying, marked "new".

## 3. Findings
Your final list, ordered by severity (blocker, major, minor, nit). Each: file:line, what is wrong, the failure it
causes, the fix. Say plainly when you found nothing."""

def review_prompt(meta):
    return (f"Review the change on this branch against origin/develop (`git diff origin/develop...HEAD`; nothing is "
            f"staged or untracked). There is no separate plan; the author's description of the change is its commit "
            f"message:\n\n<<<\n{meta['msg'].strip()}\n>>>\n\nnode_modules is not installed in this checkout, so read "
            f"code rather than running tests or typecheck.\n\n{STAGES}")

def review(cid, tag):
    d = ROOT / 'cases' / tag / cid
    meta = json.loads((d / 'meta.json').read_text())
    out = ROOT / 'runs' / tag / cid
    out.mkdir(parents=True, exist_ok=True)
    prev = out / 'review.md'
    if prev.exists() and '## 3' in prev.read_text() and not re.search(r'hit your .*limit', prev.read_text(), re.I):
        return cid
    cmd = ['claude', '-p', '--agent', 'dou-reviewer', '--model', 'opus', '--effort', 'high',
           '--setting-sources', 'project', '--allowedTools', 'Read', 'Grep', 'Glob', 'Bash',
           '--output-format', 'stream-json', '--verbose', review_prompt(meta)]
    with open(out / 'stream.jsonl', 'w') as f:
        r = subprocess.run(cmd, cwd=d / 'repo', stdout=f, stderr=subprocess.PIPE, text=True, timeout=3600)
    text, usage = None, {}
    for line in (out / 'stream.jsonl').read_text().splitlines():
        try:
            ev = json.loads(line)
        except Exception:
            continue
        if ev.get('type') == 'result':
            text = ev.get('result')
            usage = {k: ev.get(k) for k in ('total_cost_usd', 'duration_ms', 'num_turns')}
    if not text or '## 3' not in text or re.search(r'hit your .*limit', text, re.I):
        (out / 'error.txt').write_text(r.stderr)
        return cid + ' FAILED'
    (out / 'review.md').write_text(text)
    (out / 'usage.json').write_text(json.dumps(usage))
    return cid

JUDGE_DEFECT = """You grade a code reviewer's output against known defects. The change was later fixed because of each
expected defect below. Decide, for each expected defect, whether the reviewer identified the SAME mechanism (same
root cause and the same failure, even in other words). A finding that only touches the same file, or names a generic
risk without the mechanism, does not count.

Stages: s1 = it appears in section "1. First pass"; s2 = it appears in "2. Verification" as confirmed (or "new" and
confirmed); s3 = it appears in "3. Findings". Quote the reviewer's words that match (or "" if none).

Expected defects:
{expected}

Reviewer output:
<<<
{review}
>>>

Answer with JSON only: {{"defects":[{{"index":0,"s1":bool,"s2":bool,"s3":bool,"quote":"...","note":"..."}}]}}"""

JUDGE_CONTROL = """You grade a code reviewer's findings on a change that was merged and needed no follow-up fix for 30
days. You are in the repository at that change (`git diff origin/develop...HEAD` is the change). For each finding in
section "3. Findings" decide, after reading the code it points at:
- "real": a genuine defect the change introduces that would cause a user-visible or correctness failure;
- "fp": the claim is wrong, the failure cannot happen, or it is out of the diff's scope;
- "nit": true but only style, docs, test coverage or a hypothetical with no concrete failure.
Also give the reviewer's own severity label. Be concrete; read the code.

Reviewer output:
<<<
{review}
>>>

Answer with JSON only as your final message: {{"findings":[{{"title":"...","severity":"blocker|major|minor|nit","verdict":"real|fp|nit","why":"..."}}]}}"""

def judge(cid, tag):
    out = ROOT / 'runs' / tag / cid
    rv, jd = out / 'review.md', out / 'judge.json'
    if not rv.exists() or (jd.exists() and jd.stat().st_mtime > rv.stat().st_mtime):
        return cid
    if '## 3' not in rv.read_text():
        return cid + ' NO REVIEW'
    c = CASES[cid]
    rev = (out / 'review.md').read_text()
    if c['kind'] == 'defect':
        exp = '\n'.join(f"[{i}] {e}" for i, e in enumerate(c['expected']))
        prompt = JUDGE_DEFECT.format(expected=exp, review=rev)
        cmd = ['claude', '-p', '--model', 'opus', '--effort', 'medium', '--setting-sources', 'project',
               '--output-format', 'json', '--tools', '', '--', prompt]
        cwd = ROOT
    else:
        prompt = JUDGE_CONTROL.format(review=rev)
        cmd = ['claude', '-p', '--model', 'opus', '--effort', 'medium', '--setting-sources', 'project',
               '--allowedTools', 'Read', 'Grep', 'Glob', 'Bash', '--output-format', 'json', prompt]
        cwd = ROOT / 'cases' / tag / cid / 'repo'
    r = subprocess.run(cmd, cwd=cwd, capture_output=True, text=True, timeout=3600)
    try:
        res = json.loads(r.stdout)['result']
        m = re.search(r'\{[\s\S]*\}', res)
        data = json.loads(m.group(0))
    except Exception as e:
        (out / 'judge_error.txt').write_text(r.stdout + '\n' + r.stderr)
        return cid + ' JUDGE FAILED'
    (out / 'judge.json').write_text(json.dumps(data, indent=1))
    return cid

def leaked(cid, tag):
    meta = ROOT / 'cases' / tag / cid / 'meta.json'
    checklist = json.loads(meta.read_text()).get('checklist', '') if meta.exists() else ''
    return any(sha[:9] in checklist for sha in re.findall(r'[0-9a-f]{7,40}', CASES[cid]['fix']))

def escaped(cid, tag):
    stream = ROOT / 'runs' / tag / cid / 'stream.jsonl'
    own = str(ROOT / 'cases' / tag / cid)
    for line in stream.read_text().splitlines() if stream.exists() else []:
        try:
            event = json.loads(line)
        except ValueError:
            continue
        for block in event.get('message', {}).get('content', []) if event.get('type') == 'assistant' else []:
            text = json.dumps(block.get('input', {})) if block.get('type') == 'tool_use' else ''
            for path in re.findall(r'/[\w./-]+', text):
                if (path.startswith(str(ROOT / 'cases')) and not path.startswith(own)) or path.startswith(str(SRC)):
                    return True
    return False

def score(tag):
    rows = []
    for cid, c in CASES.items():
        j = ROOT / 'runs' / tag / cid / 'judge.json'
        if not j.exists():
            continue
        data = json.loads(j.read_text())
        u = ROOT / 'runs' / tag / cid / 'usage.json'
        usage = json.loads(u.read_text()) if u.exists() else {}
        rows.append({'id': cid, 'kind': c['kind'], 'group': c.get('group'), 'leak': c['kind'] == 'defect' and leaked(cid, tag),
                     'escaped': escaped(cid, tag), 'judge': data, 'usage': usage})
    for r in rows:
        if r['escaped']:
            print(f"{r['id']}: the reviewer read outside its case repository; its result is not clean")
    (ROOT / 'runs' / tag / 'score.json').write_text(json.dumps(rows, indent=1))
    d = [r for r in rows if r['kind'] == 'defect']
    for label, pick in (('all', lambda r: True), ('holdout', lambda r: r['group'] == 'holdout'),
                        ('design, fix not cited', lambda r: r['group'] == 'design' and not r['leak']),
                        ('design, fix cited in REVIEW.md', lambda r: r['group'] == 'design' and r['leak'])):
        sel = [x for r in d if pick(r) for x in r['judge']['defects']]
        if sel:
            n = len(sel)
            print(f"defects {label}: n={n} s1={sum(x['s1'] for x in sel)} s2={sum(x['s2'] for x in sel)} "
                  f"s3={sum(x['s3'] for x in sel)}")
    for r in rows:
        if r['kind'] == 'control':
            f = r['judge']['findings']
            print(r['id'], {v: sum(1 for x in f if x['verdict'] == v) for v in ('real', 'fp', 'nit')},
                  'fp>=major:', sum(1 for x in f if x['verdict'] == 'fp' and x['severity'] in ('blocker', 'major')))

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('cmd')
    ap.add_argument('ids', nargs='*')
    ap.add_argument('--tag', default='before')
    ap.add_argument('--review')
    ap.add_argument('-j', type=int, default=4)
    a = ap.parse_args()
    ids = a.ids or list(CASES)
    if a.cmd == 'score':
        return score(a.tag)
    fn = {'build': lambda i: build(i, a.tag, a.review), 'review': lambda i: review(i, a.tag),
          'judge': lambda i: judge(i, a.tag)}[a.cmd]
    with ThreadPoolExecutor(a.j if a.cmd != 'build' else 1) as ex:
        def safe(i):
            try:
                return fn(i)
            except Exception as e:
                return f'{i} ERROR {e}'
        for res in ex.map(safe, ids):
            print(res, flush=True)

if __name__ == '__main__':
    main()
