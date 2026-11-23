# revert-ratchet

`revert.js` is the script behind `.github/workflows/revert-ratchet.yml`. When a pull request whose
title starts with `Revert` merges into `develop`, the workflow finds the reverted pull request and
opens an issue labelled `ratchet`. The reverted pull request is found from `Reverts #N` in the body,
`This reverts commit <sha>` in a commit, or the quoted title.

The issue does three things:

- proposes a candidate rule, built from the projects the reverted pull request touched;
- asks for an adversarial check before the rule is accepted: try to make the candidate fire on
  correct changes (recent merged pull requests, the code as it is) and narrow it until no
  counterexample is left;
- leaves the approval to a person.

A revert that nothing deterministic could have caught is closed with the reason written down.

```bash
node scripts/revert-ratchet/revert.js targets revert.json   # {title, body, commitMessages} → targets
node scripts/revert-ratchet/revert.js issue issue.json      # {revert, original} → issue body
node --test 'scripts/revert-ratchet/__tests__/*.test.js'
```

The workflow runs on `pull_request_target` to get a token that can write issues. It checks out only
this directory from `develop` and never runs the pull request's code. The title, body and commit
messages reach the script through files, never through shell interpolation.
