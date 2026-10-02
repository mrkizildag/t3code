#!/usr/bin/env bash
# Installs the latest fork release into /Applications.
# Fork builds are unsigned, so the app cannot update itself.
set -euo pipefail

repo="mrkizildag/t3code"
app_name="T3 Code (Alpha).app"
app_path="/Applications/$app_name"

tag="$(gh release view -R "$repo" --json tagName --jq .tagName)"
latest="${tag#fork-}"
installed="$(defaults read "$app_path/Contents/Info.plist" CFBundleShortVersionString 2>/dev/null || true)"

if [ "$installed" = "$latest" ]; then
  echo "Already on $latest."
  exit 0
fi
echo "Updating ${installed:-(not installed)} -> $latest"

work="$(mktemp -d)"
trap 'rm -rf "$work"' EXIT
gh release download "$tag" -R "$repo" --pattern '*-arm64.zip' --dir "$work"
ditto -x -k "$work"/*-arm64.zip "$work/app"

if pgrep -f "$app_path/Contents/MacOS/" >/dev/null; then
  osascript -e "quit app \"${app_name%.app}\""
  while pgrep -f "$app_path/Contents/MacOS/" >/dev/null; do sleep 1; done
fi

rm -rf "$app_path"
mv "$work/app/$app_name" "$app_path"
echo "Installed $latest."
open "$app_path"
