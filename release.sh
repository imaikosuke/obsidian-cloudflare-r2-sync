#!/usr/bin/env bash
# Release: pnpm run check, pnpm version (syncs manifest + tag), push branch + tag.
# GitHub Actions release workflow runs on the pushed tag.
#
# Usage: ./release.sh <patch|minor|major|...|X.Y.Z>
# Requires: pnpm, git, clean working tree, remote "origin" with push access.

set -euo pipefail

usage() {
	cat <<'EOF'
Usage: release.sh <version>

  bump: patch | minor | major | prepatch | preminor | premajor | prerelease
  or:   an explicit SemVer, e.g. 1.2.3

  -h, --help   show this help

Example:
  ./release.sh minor
EOF
}

case "${1:-}" in
	-h | --help)
		usage
		exit 0
		;;
esac

if [ $# -ne 1 ]; then
	echo "Expected a single version argument (see --help)." >&2
	usage >&2
	exit 1
fi
VERSION_ARG=$1

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$ROOT"

if ! command -v pnpm >/dev/null 2>&1; then
	echo "pnpm is not on PATH. Install pnpm or run: corepack enable" >&2
	exit 1
fi

if [ -n "$(git status --porcelain)" ]; then
	echo "Working tree is not clean. Commit or stash changes before releasing." >&2
	git status -s
	exit 1
fi

pnpm run check
pnpm version "$VERSION_ARG"

BRANCH=$(git rev-parse --abbrev-ref HEAD)
NEW_TAG=$(git tag --points-at HEAD | head -1)
if [ -z "$NEW_TAG" ]; then
	echo "No tag on HEAD after pnpm version. Something went wrong." >&2
	exit 1
fi

echo "Pushing $BRANCH and tag $NEW_TAG to origin…"
git push origin "$BRANCH"
git push origin "refs/tags/$NEW_TAG"

echo "Done. Tag $NEW_TAG was pushed; GitHub Actions release workflow should start."
