#!/usr/bin/env bash
# Creates or removes a throwaway worktree for a PR review, so the user's own
# working tree, branches and stash are never touched.
#
#   worktree.sh add <clone> <number> <base-branch>
#     Fetches the PR head and the latest base, creates a detached worktree at the
#     PR head, then merges the latest base into it (local only, never pushed).
#     Prints: path=..., head=..., base=..., merge=clean|conflict, conflicts=...
#
#   worktree.sh remove <clone> <number>
set -euo pipefail

CMD="${1:?usage: worktree.sh add|remove <clone> <number> [base]}"
CLONE="${2:?missing clone path}"
NUM="${3:?missing PR number}"
TMP="${TMPDIR:-/tmp}"; WT="${TMP%/}/dp-review-$(basename "$CLONE")-$NUM"

case "$CMD" in
  add)
    BASE="${4:?missing base branch}"
    git -C "$CLONE" fetch --quiet origin "pull/$NUM/head" "+refs/heads/$BASE:refs/remotes/origin/$BASE"
    HEAD_SHA=$(git -C "$CLONE" rev-parse FETCH_HEAD)
    if [[ -d "$WT" ]]; then git -C "$CLONE" worktree remove --force "$WT"; fi
    git -C "$CLONE" worktree add --quiet --detach "$WT" "$HEAD_SHA"
    BASE_SHA=$(git -C "$WT" rev-parse "origin/$BASE")
    echo "path=$WT"
    echo "head=$HEAD_SHA"
    echo "base=$BASE_SHA"
    if git -C "$WT" -c user.name=review -c user.email=review@localhost merge --quiet --no-edit --no-ff "origin/$BASE" >/dev/null 2>&1; then
      echo "merge=clean"
    else
      echo "merge=conflict"
      echo "conflicts=$(git -C "$WT" diff --name-only --diff-filter=U | paste -sd, -)"
      git -C "$WT" merge --abort
    fi
    ;;
  remove)
    if [[ -d "$WT" ]]; then git -C "$CLONE" worktree remove --force "$WT"; fi
    git -C "$CLONE" worktree prune
    echo "removed=$WT"
    ;;
  *) echo "unknown command: $CMD" >&2; exit 2 ;;
esac
