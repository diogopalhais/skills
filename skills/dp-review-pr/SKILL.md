---
name: dp-review-pr
description: Review one pull request in depth, check every claim against real command output, show me the findings, and after my OK post the GitHub review and mark the Slack review request with a checkmark. Use when I ask to review, re-review, or approve a specific PR.
argument-hint: <number | owner/repo#number | PR URL> [focus notes]
allowed-tools: Bash(${CLAUDE_SKILL_DIR}/scripts/pr-context.sh:*), Bash(${CLAUDE_SKILL_DIR}/scripts/worktree.sh:*), Bash(gh pr view:*), Bash(gh pr diff:*), Bash(gh pr checks:*), Bash(gh run view:*), Bash(git diff:*), Bash(git log:*), Bash(git show:*)
---

# Review a PR

Input: `$ARGUMENTS`. The first word is the PR. A bare number resolves against the current directory's repo, then against `appliedblockchain/giano`. Any other words are focus notes from the user; give those areas extra attention.

If no PR is given, ask for one and suggest `/dp-outstanding-prs` to find it.

## Rules

These rules come from earlier reviews. Follow every one.

- **Nothing leaves the machine before my OK.** Do not post a GitHub review or comment, add a Slack reaction, or send a Slack message until I confirm in step 6. The review goes out under my name.
- **Prove every claim.** Every finding needs evidence: a command and its output, or a file and line plus a concrete scenario. Do not report something as fact from a file name, a PR title, or a guess.
- **Blocker means proven breakage.** Mark a finding as a blocker only when you can show what breaks, for whom, and how: a failing command, a failing test, or a code path with concrete input that produces wrong behavior. Otherwise it is "should fix" or "nit". If you are unsure, use the lower level and say what would confirm it.
- **Conflicts need both diffs.** Before you say this PR conflicts with or duplicates another PR, read both diffs. Matching file names prove nothing.
- **Never touch my working tree.** Work only in the throwaway worktree from `worktree.sh`. Never run `git stash`, `git checkout`, or `git reset` in my clone. Never push.
- **Stacked PRs:** if the PR's base is another open PR's branch, review only this PR's own diff (against its base), and say where it sits in the stack.
- **Long commands:** give every long command a timeout. Do not rerun something CI already ran and passed on the same head commit; use the CI result as evidence and spend local time on what CI does not cover.
- **Write in plain English.** Lead with the verdict. Use single verbs, not phrasal verbs, and no idioms.

## Steps

### 1. Collect context

```bash
${CLAUDE_SKILL_DIR}/scripts/pr-context.sh <PR>
```

The JSON contains the repo, the local clone path, PR metadata and body, files, CI results, the stack (parent and child PRs), my previous reviews, other reviews, and all review threads.

Then:
- If `authoredByMe` is true, tell me that GitHub allows only a COMMENT on my own PR, and ask whether to continue.
- If `pr.state` is not OPEN, or `pr.isDraft` is true, tell me and ask whether to continue.
- If `localClone` is null, ask me for the path to a local clone. Do not clone into my folders without asking.
- Read the repo's own rules: `AGENTS.md`, `CLAUDE.md`, and `CONTRIBUTING.md` at the clone root, if they exist. Check the PR against them (for Giano: exact pinned versions, `--frozen-lockfile`, lockfile changes committed alone with their manifest change, Conventional Commits, an OpenSpec change for larger work).
- Read linked issues or the ticket named in the PR body if they define what the PR must do.

### 2. Decide the scope

- **First review** (`reReview` false): review the full diff, `gh pr diff <n> -R <repo>`.
- **Re-review** (`reReview` true): review the commits since `lastReviewedSha` (`git diff <lastReviewedSha>..<head>` in the worktree). If that commit is gone after a force push, review the full diff. For each thread I started, check whether the new code addresses it, and list each one as addressed or not addressed.
- Note what other reviewers already said, so you do not repeat their comments. Agree with or build on them only when you add evidence.

### 3. Prepare the worktree

```bash
${CLAUDE_SKILL_DIR}/scripts/worktree.sh add <localClone> <number> <base>
```

It prints the worktree path, the head and base commits, and whether the PR merges cleanly onto the latest base. A merge conflict is a finding, and the evidence is the list of conflicting files. The worktree holds the PR head with the latest base merged in locally, so the checks run on what main will contain after the merge.

### 4. Check the claims

Run in the worktree. Choose the checks the diff needs:

| Changed | Check |
|---|---|
| Any code | Install with the frozen lockfile (`pnpm install --frozen-lockfile`), then lint, typecheck and tests for each touched package (`pnpm -F <pkg> typecheck`, `pnpm -F <pkg> test`) |
| `package.json` or the lockfile | Reinstall and confirm the lockfile does not change (`git diff --exit-code pnpm-lock.yaml`). Confirm exact versions and the repo's release-age rule. |
| Helm charts or Kubernetes manifests | Render them (`helm template`) and read the output. If `helm` is not installed, say that the check was skipped. |
| Dockerfiles or images | Check base image pins and digests. Build only when the change cannot be judged without a build, with a timeout. |
| CI workflows | Check action pins (commit SHAs), permissions, and triggers. |
| A bug fix with a test | Negative check: revert the fix in the worktree and confirm the new test fails. Restore the worktree afterwards. |
| Any added line | Secret scan of the added lines: private keys, `-----BEGIN`, API tokens, mnemonics, `.env` values. Judge 64-character hex values in context, since they can be transaction hashes. |

Also:
- Check every claim in the PR description ("fixes X", "no behavior change", "covered by tests") against the code or a command.
- For failing CI, read the log (`gh run view <run-id> --log-failed`) and say whether this PR causes the failure or it already exists on the base.
- Record each command you ran and its result. This list goes into the review.

### 5. Classify and calibrate

Put each finding at one level:
- **Blocker:** proven breakage, as defined in the rules.
- **Should fix:** a real problem with no proven breakage today (a missing test, a risky default, a rule from AGENTS.md broken).
- **Nit:** style, naming, wording. Keep nits few.

Then do a calibration pass. For each blocker, write one sentence: "This breaks <what> for <whom> because <evidence>." If you cannot write that sentence, lower the level.

Pick the review event:
- No blockers and no open "should fix" findings: APPROVE.
- No blockers, with "should fix" findings: APPROVE with comments, or COMMENT. Recommend one and say why.
- Any blocker: REQUEST_CHANGES.
- My own PR: COMMENT only.

### 6. Show me the review and wait

Show this, then stop and wait for my answer:

1. **Verdict line:** the proposed event and one sentence on why.
2. **Findings table:** level, `file:line`, the finding, the evidence.
3. **Checks run:** each command with pass or fail. List any skipped checks with the reason.
4. **Re-review status** (re-reviews only): each earlier thread, addressed or not addressed.
5. **Draft review:** the review body and each inline comment, exactly as they will be posted.
6. **Slack:** the review-request messages found (see step 8), with links, and that each one will get a ✅. If none are found, say so.

I may edit, drop, or change the level of findings. Apply my changes and show only what changed. Post only after I confirm.

### 7. Post the GitHub review

Write the review as one JSON payload and post it in one call, so the inline comments and the verdict arrive together:

```bash
cat > "$TMPDIR/dp-review-<n>.json" <<'JSON'
{
  "commit_id": "<head sha>",
  "event": "APPROVE | REQUEST_CHANGES | COMMENT",
  "body": "<review body>",
  "comments": [
    { "path": "src/file.ts", "line": 42, "side": "RIGHT", "body": "<comment>" },
    { "path": "src/file.ts", "start_line": 10, "line": 14, "side": "RIGHT", "body": "<comment on a range>" }
  ]
}
JSON
gh api -X POST repos/<owner>/<repo>/pulls/<n>/reviews --input "$TMPDIR/dp-review-<n>.json"
```

- Use the head commit from the context. If the head changed since step 1, stop, tell me, and redo the review for the new commits.
- Inline comments must point at lines in the diff. If GitHub rejects a line (HTTP 422), move that comment into the review body under its file and line, and post again.
- **Review body format:** the verdict in one sentence, then "Checked:" with the commands run and their results, then the blockers if any. Do not repeat the inline comments.
- **Inline comment format:** start with the level in bold (`**Blocker:**`, `**Should fix:**`, `**Nit:**`). Then say what is wrong, why it matters, and the fix. Use a GitHub ```suggestion block when the fix is small and exact.
- If approval fails (for example, missing permission), report the exact error. Do not fall back to another event without asking.
- After posting, read back the review (`gh api repos/<owner>/<repo>/pulls/<n>/reviews --jq '.[-1] | {state, html_url}'`) and report the actual state: APPROVED, CHANGES_REQUESTED, or COMMENTED.

### 8. Mark the Slack review request

Find the messages that ask for a review of this PR:
- Search with `slack_search_public_and_private`, keywords `[<slackSearch.keyword>]`, `include_bots: true`, `response_format: "detailed"`, and `after` set to the PR creation time (as a Unix timestamp). If that finds nothing, search again with the full PR URL.
- A message counts as a review request when it links this PR and either:
  - asks someone to review it (for example "review", "take a look", "PTAL", or a reviewer mention), or
  - is a reply in a thread whose first message asks for reviews. This is the team's usual format: a first message such as "PRs ready to review", then one reply per PR. Read the thread's first message (`slack_read_thread`) to confirm it.
- A message that only mentions the PR in a list of updates does not count, unless it asks for review of this PR.
- Mark the message that links this PR. When the request is a reply in a thread, mark that reply, not the thread's first message, because the first message covers several PRs.

After the GitHub review is posted, whatever the verdict, add the reaction to each request message:

```
slack_add_reaction(channel_id, message_ts, emoji: "white_check_mark")
```

Report each message you marked, with its channel and link. If none were found, say so. Do not post a Slack reply unless I asked for one in step 6. If I ask, read the thread first and match the format of the earlier replies.

### 9. Clean up and report

```bash
${CLAUDE_SKILL_DIR}/scripts/worktree.sh remove <localClone> <number>
```

Final message:
- The answer: what was posted, for example "Posted APPROVE on giano#340 with 2 inline comments."
- A link to the review.
- The Slack messages marked with ✅.
- Anything skipped or left open.
