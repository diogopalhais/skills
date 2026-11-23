---
name: dp-task
description: Take a ticket from start to review. Assess it, plan it as an OpenSpec change, implement it in stacked branches, verify every layer, open the PRs, get CI green, and after my OK mark them ready, update the ticket, and announce them. Use when I ask to start, work on, continue, or ship a ticket such as G5 or a Notion ticket URL.
argument-hint: <ticket code | Notion URL> [notes]
---

# Work a ticket from start to review

Input: `$ARGUMENTS`. The first word is the ticket: a code such as `G5`, or a Notion URL. Any other words are notes from me; follow them.

## Rules

These rules come from earlier task sessions. Follow every one.

- **Work in the current project folder.** If the current folder is not a git repo, stop and ask which project folder to use.
- **Project resources come from the repo.** Read `AGENTS.md` and `CLAUDE.md` at the repo root first. They name the ticket database, the Slack channel, the branch and PR naming rules, the stack tool, and what you may and may not do. If they do not name a ticket database or a Slack channel, ask me.
- **Two stops for my OK:** after the assessment (step 3), and before anything is announced (step 9). Between them, work without stopping, unless a new design decision comes up. Then stop and ask, and give your recommendation first.
- **Prove every claim.** Before you say this work conflicts with or duplicates another PR or OpenSpec change, read both diffs. Matching file names prove nothing.
- **Do not lose my work.** If the working tree has uncommitted changes, stop and ask. Never run `git stash`. Never force-push, except `gh stack push` or `gh stack submit` on a stack I own, as `AGENTS.md` allows. Never merge.
- **Verify every layer.** After any change to a branch in a stack, rebase every branch above it, then run lint, typecheck and tests on every branch before you push any of them.
- **No AI attribution.** No `Co-Authored-By` trailer and no "Generated with Claude" line in commits, PR bodies, or messages.
- **Write in plain English:** the answer first, single verbs instead of phrasal verbs, no idioms. This applies to the OpenSpec change, PR descriptions, Notion, and Slack.

## Steps

### 1. Load the project and the ticket

1. Read `AGENTS.md` and `CLAUDE.md`.
2. Find the ticket in the ticket database named in `AGENTS.md`. Fetch the database to get its data source, then query it. For Giano, ticket names look like `G46 - <title>`, so match `Name LIKE '<code> - %'` (this keeps `G5` from matching `G50`). If you find no match or more than one, ask me.
3. Read the full ticket page and its comments. Note its status and assignee.

### 2. Check for earlier work on this ticket

The ticket may already be in progress from an earlier session. Look for:
- open or merged PRs with the code in the title: `gh pr list --state all --search "<code> in:title"`
- local and remote branches for it: `git branch -a`
- an OpenSpec change for it: `openspec list`, then `openspec show <change>`, and its `tasks.md` checkboxes

If earlier work exists, say what is done, then continue from the first step that is not finished. Do not redo finished steps.

### 3. Assess, then stop for my OK

1. Run `git fetch origin` and `gh pr list` (open PRs), and run `openspec list` (changes in progress).
2. Read the code the ticket touches. For each open PR or OpenSpec change that touches the same area, read its diff or its tasks before you decide whether it is related.
3. Show me the assessment:
   - **Recommendation first:** the approach in one or two sentences.
   - **Requirements:** each requirement from the ticket, numbered (R1, R2, …), and how the approach meets it. Say plainly if the approach does not fully meet one.
   - **Current behavior:** what the code does today, with `file:line` references.
   - **Related work:** open PRs and OpenSpec changes that overlap, with the evidence. Say "none found" when that is true.
   - **Options**, only when there is a real choice: each one with its cost, with the recommended one first.
   - **Stack plan:** the branches, one per layer, in order (for example contracts, then backend, then client, then UI). Use one branch when the work is small.
   - **Questions:** decisions only I can make.
4. Wait for my answer.

After my OK, set the ticket's Status to "In progress" and assign it to me, if it is not already.

### 4. Write the plan as an OpenSpec change

Skip this step only for a small fix (one package, no behavior change across packages), and say why you skipped it.

1. Follow the repo's OpenSpec workflow: `openspec instructions` lists the artifacts and their rules.
2. Write the change under `openspec/changes/<change-name>/`: proposal, design (when there are choices), spec deltas, and `tasks.md`. Map every ticket requirement to at least one task, and group the tasks by stack layer.
3. Run `openspec validate <change-name> --strict` and fix every error.
4. Commit it with an `openspec:` commit on the first branch of the stack.

### 5. Implement

1. Create the branches from the latest `origin/main`, with the naming rule from `AGENTS.md` (for example `feat/<short-name>`). Use the stack tool from `AGENTS.md` (`gh stack`) for more than one branch.
2. Work through `tasks.md` in order. Tick each task when it is done and tested. Commit in small Conventional Commits.
3. Add a changeset (`pnpm changeset`) when a published package changes.
4. When you change user-facing text, search the e2e tests for that text first, because e2e tests often find elements by exact text.
5. If a task needs a decision the assessment did not cover, stop and ask.

### 6. Verify every layer

For each branch in the stack, from the bottom up:
- `pnpm lint`
- `pnpm -F <package> typecheck` and `pnpm -F <package> test` for each package the branch touches
- the e2e tests when the branch changes a user flow the e2e tests cover, with a timeout

Show a table: branch, check, pass or fail. Fix failures on the branch that caused them, rebase the branches above it, and run the table again. Push only when every cell passes.

### 7. Open draft PRs

1. Push and open one draft PR per branch (`gh stack submit`, or `gh pr create --draft` for one branch). Each PR targets the branch below it.
2. Title: Conventional Commits with a scope and the ticket code, for example `feat(wallet-api): add session expiry (G5)`.
3. Body, in this order:
   - What the PR does and why, in two or three sentences, with a link to the ticket.
   - What changed, as a short list.
   - How it was tested: the commands and their results.
   - What is not covered yet, if anything.
   - **DevOps requests**, when the change needs new secrets, environment values, or infrastructure. Write them in the PR body, not in Slack drafts.
   - The position in the stack, for stacked PRs.

### 8. Get CI green

1. Watch the checks with a timeout: `gh pr checks <n> --watch`.
2. When a check fails, read the log (`gh run view <run-id> --log-failed`). Find the cause, fix it on the branch that caused it, run step 6 again on every layer, and push.
3. Check that each PR still merges cleanly into its base (`gh pr view <n> --json mergeable,mergeStateStatus`). Fix conflicts before you report the PRs as ready.
4. If the same check fails three times for the same reason, stop and ask me.

### 9. Prepare the handoff, then stop for my OK

Show me:
- **Answer line:** for example "3 PRs are green and ready for review."
- **PR table:** number (linked), title, CI, mergeable.
- **Notion:** the status change to "In review", and a comment on the ticket that lists the PRs.
- **Reviewers:** whom to request. Propose the people who reviewed this area recently.
- **Slack draft** for the channel named in `AGENTS.md`. Match my earlier posts: mention the reviewers with `<@USER_ID>`, ask the question first, then give one line per PR on what it does and why. For one PR: "<@USER_ID> could you review <link|#N>? <what and why>." For a stack, use one bullet per PR, from the bottom up, and say that they merge in that order. Read my last few posts in that channel to match the tone.

Wait for my OK. I may edit any part.

### 10. Hand off

After my OK:
1. Mark the PRs ready (`gh pr ready <n>`) and request the reviewers (`gh pr edit <n> --add-reviewer <login>`).
2. Set the ticket's Status to "In review" and add the comment that lists the PRs.
3. Post the Slack message. Load the `ae-slack-formatting` skill first.
4. Report: the PRs with links, the Notion update, the Slack message link, and anything left open, such as DevOps requests or follow-up tickets.
