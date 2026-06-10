#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
script_path="$repo_root/scripts/launch-local-mac.applescript"
app_path="$repo_root/BachinApp.app"

if ! command -v osacompile >/dev/null 2>&1; then
  echo "osacompile is required to build the macOS launcher app." >&2
  exit 1
fi

rm -rf "$app_path"
osacompile -o "$app_path" "$script_path"
echo "Built $app_path"
