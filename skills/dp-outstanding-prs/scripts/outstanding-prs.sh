#!/usr/bin/env bash
# Lists every open PR (any repo) that waits on an action from the current GitHub user.
# Output: one JSON object per PR, with the reasons already computed.
set -euo pipefail

ME=$(gh api user --jq .login)

read -r -d '' QUERY <<'GQL' || true
fragment P on PullRequest {
  number title url isDraft updatedAt additions deletions changedFiles
  repository { nameWithOwner }
  author { login }
  baseRefName headRefName headRefOid
  reviewDecision mergeable mergeStateStatus
  reviewRequests(first: 20) { nodes { requestedReviewer { __typename ... on User { login } ... on Team { slug } } } }
  latestOpinionatedReviews(first: 30) { nodes { author { login } state } }
  myLast: reviews(last: 1, author: $login) { nodes { state submittedAt commit { oid } } }
  myLastOpinion: reviews(last: 1, author: $login, states: [APPROVED, CHANGES_REQUESTED]) { nodes { state commit { oid } } }
  reviewThreads(first: 40) { nodes { isResolved path comments(last: 5) { nodes { author { login } } } } }
  commits(last: 1) { nodes { commit { statusCheckRollup { state contexts(first: 40) { nodes {
    __typename
    ... on CheckRun { name conclusion status }
    ... on StatusContext { context state }
  } } } } } }
}
query($login: String!, $q1: String!, $q2: String!, $q3: String!) {
  requested: search(query: $q1, type: ISSUE, first: 25) { nodes { ...P } }
  reviewed:  search(query: $q2, type: ISSUE, first: 25) { nodes { ...P } }
  mine:      search(query: $q3, type: ISSUE, first: 25) { nodes { ...P } }
}
GQL

Q1="is:pr is:open archived:false review-requested:$ME"
Q2="is:pr is:open archived:false reviewed-by:$ME -author:$ME"
Q3="is:pr is:open archived:false author:$ME"

fetch() { gh api graphql -f query="$QUERY" -f login="$ME" -f q1="$Q1" -f q2="$Q2" -f q3="$Q3"; }
# GitHub sometimes returns 502/504 on large search queries. Retry once.
RESULT=$(fetch 2>/dev/null || { sleep 3; fetch; })

printf '%s' "$RESULT" |
jq -c --arg me "$ME" '
  def failing: [.commits.nodes[0].commit.statusCheckRollup.contexts.nodes[]?
      | select((.conclusion // .state) as $s | $s == "FAILURE" or $s == "ERROR" or $s == "TIMED_OUT" or $s == "CANCELLED" or $s == "ACTION_REQUIRED")
      | (.name // .context)] | unique;
  def ci: (.commits.nodes[0].commit.statusCheckRollup.state // "NONE");
  def threads_waiting($mine_only):
      [.reviewThreads.nodes[]
        | select(.isResolved | not)
        | select(($mine_only | not) or ([.comments.nodes[].author.login] | index($me)))
        | select(.comments.nodes[-1].author.login != $me)] | length;
  def base: {
      repo: .repository.nameWithOwner, number, title, url, author: .author.login,
      draft: .isDraft, base: .baseRefName, head: .headRefName,
      size: "+\(.additions)/-\(.deletions) files=\(.changedFiles)",
      decision: .reviewDecision, mergeable, mergeState: .mergeStateStatus,
      ci: ci, failing: failing,
      approvedBy: [.latestOpinionatedReviews.nodes[] | select(.state == "APPROVED") | .author.login],
      changesRequestedBy: [.latestOpinionatedReviews.nodes[] | select(.state == "CHANGES_REQUESTED") | .author.login],
      waitingOnReviewers: [.reviewRequests.nodes[].requestedReviewer | (.login // ("team:" + .slug))],
      updatedAt,
      daysIdle: ((now - (.updatedAt | fromdateiso8601)) / 86400 | floor)
    };

  .data as $d
  | ($d.requested.nodes | map(.url)) as $req
  | (
      # PRs by others where I am, or was, a reviewer
      ([$d.requested.nodes[], $d.reviewed.nodes[]] | unique_by(.url) | map(
        . as $p
        | ($p.myLast.nodes[0]) as $last
        | ($p.myLastOpinion.nodes[0]) as $op
        | (threads_waiting(true)) as $t
        | base + {role: "reviewer", myLastReview: ($last.state // null),
          notes: ([if ($op.state == "APPROVED") and ($op.commit.oid != $p.headRefOid)
                   then "new commits since your approval (your approval still counts)" else empty end]),
          reasons: ([
            (if ($req | index($p.url)) and ($last == null) then "first review requested" else empty end),
            (if ($req | index($p.url)) and ($last != null) then "re-review requested" else empty end),
            (if ($op.state == "CHANGES_REQUESTED") and ($op.commit.oid != $p.headRefOid) then "new commits since your change request"
             elif ($op.state != "APPROVED") and ($last != null) and ($last.commit.oid != $p.headRefOid) and (($req | index($p.url)) | not) then "new commits since your last review"
             else empty end),
            (if $t > 0 then "\($t) of your review threads have a reply waiting for you" else empty end)
          ])}
      )),
      # My own PRs
      ($d.mine.nodes | map(
        . as $p
        | (threads_waiting(false)) as $t
        | base + {role: "author", reasons: ([
            (if $p.isDraft then "draft: mark ready when done" else empty end),
            (if $p.reviewDecision == "CHANGES_REQUESTED" then "changes requested" else empty end),
            (if (ci == "FAILURE" or ci == "ERROR") then "CI failing" else empty end),
            (if $p.mergeable == "CONFLICTING" then "merge conflicts" else empty end),
            (if $p.mergeStateStatus == "BEHIND" then "branch behind base" else empty end),
            (if ($p.isDraft | not) and $p.reviewDecision == "REVIEW_REQUIRED" and ($p.reviewRequests.nodes | length) == 0
                and ([$p.latestOpinionatedReviews.nodes[]] | length) == 0 then "no reviewers requested" else empty end),
            (if $t > 0 then "\($t) unresolved threads wait for your reply" else empty end),
            (if ($p.isDraft | not) and $p.reviewDecision == "APPROVED" and ci == "SUCCESS" and $p.mergeable == "MERGEABLE"
                then "ready to merge" else empty end)
          ])}
      ))
    )
  | .[]
  | . + {waitingOnMe: (.reasons | length > 0)}
'
