#!/usr/bin/env bash
# Publish one run's runtime evidence back onto the session branch.
#
# Run from beyond-minecraft/ with GITHUB_REF_NAME, GITHUB_SHA and EVALUATION set:
#   EVALUATION=success  -> replace the capture snapshot, refresh the gallery, refresh the JAR
#   anything else       -> publish diagnostics only, never images and never a binary
#
# Invariants: the checkout must be the commit this run built, and the branch must still point at
# that commit -- otherwise the branch has moved on and this run's evidence is superseded.
set -euo pipefail

: "${GITHUB_REF_NAME:?}" "${GITHUB_SHA:?}" "${EVALUATION:?}"

# Refuse to attach an old binary to newly edited sources. Never force-push.
test "$(git rev-parse HEAD)" = "$GITHUB_SHA"

built=$(git rev-parse HEAD)
remote=$(git ls-remote origin "refs/heads/$GITHUB_REF_NAME" | cut -f1)
if test -n "$remote" && test "$remote" != "$built"; then
  echo "::notice::$GITHUB_REF_NAME has moved on to $remote; this run's evidence is superseded and will not be published"
  exit 0
fi

mkdir -p docs/runtime releases

if test "$EVALUATION" = success; then
  if test -f .ci-evidence/build/verification.json; then
    cp .ci-evidence/build/verification.json docs/runtime/verification.json
  fi
  # Replace the previous snapshot's frames instead of piling runs on top of each other, but only
  # once this run actually brought captures of its own.
  fresh=$(find .ci-evidence/run/screenshots -name 'beyond-*.png' 2>/dev/null | wc -l)
  if test "$fresh" -gt 0; then
    rm -f docs/runtime/beyond-*.png
    find .ci-evidence/run/screenshots -name 'beyond-*.png' -exec cp {} docs/runtime/ \;
  else
    echo "::warning::this run produced no captures; keeping the previous snapshot's images"
  fi
  if test -f .ci-binary/beyond-minecraft-0.1.0-alpha.jar; then
    cp .ci-binary/beyond-minecraft-0.1.0-alpha.jar releases/
  else
    echo "::warning::this run did not pass a binary; keeping the previous verified JAR"
  fi
  if compgen -G 'docs/runtime/beyond-*.png' > /dev/null; then
    python3 tools/make_gallery.py docs/runtime
  fi
else
  # A failed run publishes diagnostics, never an unverified replacement JAR or a partial snapshot.
  echo "::warning::the build or playtest did not pass; publishing diagnostics only"
fi

if test -f .ci-evidence/client-smoke.log; then
  tail -100 .ci-evidence/client-smoke.log | cut -c1-700 > docs/runtime/latest-client-log.txt
fi

git config user.name 'github-actions[bot]'
git config user.email '41898282+github-actions[bot]@users.noreply.github.com'
git add docs/runtime
# One small requested installable deliverable. Other build output remains ignored.
if test -f releases/beyond-minecraft-0.1.0-alpha.jar; then
  git add -f releases/beyond-minecraft-0.1.0-alpha.jar
fi
if git diff --cached --quiet; then
  echo "Runtime evidence is unchanged; nothing to publish."
  exit 0
fi
git commit -m 'Record Beyond runtime evidence and any verified deliverable [skip ci]'
git push origin HEAD:"$GITHUB_REF_NAME"
