#!/usr/bin/env bash
# Collects everything needed to review one PR, as JSON.
# Usage: pr-context.sh <number | owner/repo#number | PR URL>
# A bare number resolves only against the current directory's GitHub repo.
# The local clone is the current directory's repo; there is no search elsewhere.
set -euo pipefail

REF="${1:?usage: pr-context.sh <number | owner/repo#number | PR URL>}"
ME=$(gh api user --jq .login)

# --- Resolve repo and number ---------------------------------------------------
REPO="" NUM=""
if [[ "$REF" =~ github\.com/([^/]+/[^/]+)/pull/([0-9]+) ]]; then
  REPO="${BASH_REMATCH[1]}" NUM="${BASH_REMATCH[2]}"
elif [[ "$REF" =~ ^([^/#[:space:]]+/[^/#[:space:]]+)#([0-9]+)$ ]]; then
  REPO="${BASH_REMATCH[1]}" NUM="${BASH_REMATCH[2]}"
elif [[ "$REF" =~ ^#?([0-9]+)$ ]]; then
  NUM="${BASH_REMATCH[1]}"
  REPO=$(gh repo view --json nameWithOwner --jq .nameWithOwner 2>/dev/null || true)
  if [[ -z "$REPO" ]]; then
    echo "error: the current folder ($PWD) is not a GitHub repo, so PR #$NUM has no repo" >&2; exit 2
  fi
  if ! gh pr view "$NUM" -R "$REPO" --json number >/dev/null 2>&1; then
    echo "error: PR #$NUM not found in $REPO (the repo of the current folder)" >&2; exit 2
  fi
else
  echo "error: cannot read PR reference '$REF'" >&2; exit 2
fi
OWNER="${REPO%%/*}" NAME="${REPO##*/}"

# --- Local clone: the current folder, only if it is this repo -------------------
CLONE=""
matches_repo() { git -C "$1" remote get-url origin 2>/dev/null | grep -qiE "github\.com[:/]${OWNER}/${NAME}(\.git)?$"; }
if top=$(git rev-parse --show-toplevel 2>/dev/null) && matches_repo "$top"; then
  CLONE="$top"
fi

# --- PR data -------------------------------------------------------------------
PR=$(gh pr view "$NUM" -R "$REPO" --json number,title,url,author,state,isDraft,body,baseRefName,headRefName,headRefOid,baseRefOid,mergeable,mergeStateStatus,reviewDecision,additions,deletions,changedFiles,files,createdAt,updatedAt,reviewRequests,statusCheckRollup,closingIssuesReferences)

read -r -d '' Q <<'GQL' || true
query($owner: String!, $name: String!, $num: Int!, $me: String!) {
  repository(owner: $owner, name: $name) {
    pullRequest(number: $num) {
      myReviews: reviews(last: 10, author: $me) { nodes { state submittedAt body commit { oid } } }
      otherReviews: latestOpinionatedReviews(first: 30) { nodes { author { login } state submittedAt } }
      reviewThreads(first: 80) { nodes {
        isResolved isOutdated path line
        comments(first: 20) { nodes { author { login } body createdAt } }
      } }
    }
  }
}
GQL
GQ=$(gh api graphql -f query="$Q" -f owner="$OWNER" -f name="$NAME" -F num="$NUM" -f me="$ME")

BASE=$(jq -r .baseRefName <<<"$PR")
HEAD=$(jq -r .headRefName <<<"$PR")
PARENT=$(gh pr list -R "$REPO" --state open --head "$BASE" --json number,title,url,baseRefName | jq -c '.[0] // null')
CHILDREN=$(gh pr list -R "$REPO" --state open --base "$HEAD" --json number,title,url --jq '.')

jq -n \
  --arg me "$ME" --arg repo "$REPO" --arg clone "$CLONE" \
  --argjson pr "$PR" --argjson gq "$GQ" --argjson parent "$PARENT" --argjson children "$CHILDREN" '
  ($gq.data.repository.pullRequest) as $g
  | ($g.myReviews.nodes) as $mine
  | {
      me: $me,
      repo: $repo,
      localClone: (if $clone == "" then null else $clone end),
      authoredByMe: ($pr.author.login == $me),
      pr: ($pr | {number, title, url, author: .author.login, state, isDraft, base: .baseRefName, head: .headRefName,
                  headSha: .headRefOid, baseSha: .baseRefOid, mergeable, mergeState: .mergeStateStatus,
                  reviewDecision, size: "+\(.additions)/-\(.deletions) files=\(.changedFiles)", createdAt, updatedAt,
                  linkedIssues: [.closingIssuesReferences[]?.url],
                  reviewRequests: [.reviewRequests[] | (.login // .slug // .name)],
                  body}),
      files: [$pr.files[] | {path, additions, deletions}],
      ci: [$pr.statusCheckRollup[] | {name: (.name // .context), result: (.conclusion // .state // .status), link: (.detailsUrl // .targetUrl)}],
      ciFailing: [$pr.statusCheckRollup[] | select((.conclusion // .state) as $s | ["FAILURE","ERROR","TIMED_OUT","CANCELLED","ACTION_REQUIRED"] | index($s)) | (.name // .context)],
      stack: {parent: $parent, children: $children},
      myPreviousReviews: [$mine[] | {state, submittedAt, commit: .commit.oid, body: (.body[0:400])}],
      reReview: (($mine | length) > 0),
      lastReviewedSha: ([$mine[] | select(.state != "PENDING")] | last | .commit.oid // null),
      otherReviews: [$g.otherReviews.nodes[] | select(.author.login != $me) | {author: .author.login, state, submittedAt}],
      threads: [$g.reviewThreads.nodes[] | {
        resolved: .isResolved, outdated: .isOutdated, path, line,
        startedByMe: (.comments.nodes[0].author.login == $me),
        lastAuthor: .comments.nodes[-1].author.login,
        comments: [.comments.nodes[] | {author: .author.login, body: (.body[0:600]), createdAt}]
      }],
      slackSearch: {keyword: "\"\($repo | split("/")[1])/pull/\($pr.number)\"", after: $pr.createdAt}
    }'
