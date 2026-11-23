---
name: dp-outstanding-prs
description: List every open PR, in any repo, that waits on an action from me (review, re-review, reply, fix, or merge). Use when I ask what PRs wait on me, what reviews are pending, what I need to review, or what blocks my PRs from merging.
allowed-tools: Bash(${CLAUDE_SKILL_DIR}/scripts/outstanding-prs.sh), Bash(gh pr view:*), Bash(gh pr checks:*)
---

## Open PRs that involve me

Each line is one PR. `role` is `reviewer` (someone else's PR) or `author` (my PR). `reasons` lists what waits on me; an empty list means the PR waits on someone else. `notes` holds information that does not need an action.

!`${CLAUDE_SKILL_DIR}/scripts/outstanding-prs.sh`

## Instructions

Report the PRs above. Stay read-only: do not review, approve, comment on, or merge any PR unless the user asks.

If the output above is empty or shows an error, run `${CLAUDE_SKILL_DIR}/scripts/outstanding-prs.sh` yourself. If it still fails, report the error and stop.

If no PR has `waitingOnMe: true`, say that nothing waits on the user, list the PRs that wait on others in one line each, and stop.

Otherwise, use this structure:

1. **Answer line.** One sentence with the counts, for example: "4 PRs wait on you: 2 reviews and 2 of your own PRs."
2. **Reviews waiting on you** (`role: reviewer`, `waitingOnMe: true`). Group by repo. Inside a repo, group stacks: a PR whose `base` is the `head` of another listed PR sits on top of it. Show each stack bottom-up, then standalone PRs. Use one table with these columns: PR (linked as `repo#number`), author, title, size, why (from `reasons`), CI.
3. **Your PRs that need an action** (`role: author`, `waitingOnMe: true`). Use one table with these columns: PR (linked), title, action needed (from `reasons`), CI. For failing CI, name the checks from `failing`. Run `gh pr checks <number> -R <repo>` only when `failing` is empty but `ci` is `FAILURE`.
4. **Idle for more than 30 days.** Move any PR with `daysIdle` over 30 out of sections 2 and 3 into a short list here, one line each, with the idle days. Suggest closing it or continuing it.
5. **Waiting on others.** One line per PR with `waitingOnMe: false`, saying who or what it waits for (`waitingOnReviewers`, pending CI). Include any `notes`.
6. **Where to start.** One sentence. Use this priority order:
   1. Re-review requests and review threads with a reply waiting for you, because someone else is blocked on you.
   2. First reviews, starting at the bottom of a stack.
   3. Your PRs with changes requested or unresolved threads.
   4. Your PRs with failing CI or merge conflicts.
   5. Your PRs that are ready to merge.

Write in plain English. Omit empty sections.

## What the script checks

The script (`scripts/outstanding-prs.sh`) runs one GitHub GraphQL query over three searches: PRs that request my review, open PRs by others that I reviewed, and my own open PRs. Archived repos are excluded.

- **Someone else's PR waits on me when:** my first review is requested; a re-review is requested; there are new commits since I requested changes; there are new commits since my last review and my approval no longer counts; or a review thread I joined has a reply from someone else.
- **My PR waits on me when:** changes are requested; CI fails; it has merge conflicts or is behind its base; an unresolved thread ends with someone else's comment; no reviewer is requested; it is a draft; or it is approved, green, and mergeable (ready to merge).
- **Limits:** up to 25 PRs per search. It tracks review threads on code lines, not general PR conversation comments.
- **Needs:** `gh` (logged in) and `jq`.
