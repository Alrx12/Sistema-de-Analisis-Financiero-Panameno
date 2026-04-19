#!/bin/bash
# Fix EAS Build: remove .npmrc that breaks project detection
# Run from the project root: bash fix-eas.sh

set -e
cd "$(dirname "$0")"

echo "→ Removing index.lock..."
rm -f .git/index.lock

echo "→ Removing mobile/.npmrc from git..."
git rm mobile/.npmrc

echo "→ Committing..."
git commit -m "fix: remove mobile/.npmrc that breaks EAS Build project detection

EAS Build finds the .npmrc (legacy-peer-deps=true) and then fails
to locate package.json. The --legacy-peer-deps flag is already
passed explicitly in the npm install command in the workflow."

echo "→ Pushing..."
git push

echo ""
echo "✓ Done. Now trigger a new EAS build or GitHub Actions run."
