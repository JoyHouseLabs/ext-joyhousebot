#!/bin/sh
set -eu

SCRIPT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
ROOT_DIR=$(CDPATH= cd -- "$SCRIPT_DIR/.." && pwd)
VERSION=$(node -e "process.stdout.write(require('$ROOT_DIR/manifest.json').version)")
OUT_DIR="$ROOT_DIR/dist"
STAGE_DIR=$(mktemp -d "${TMPDIR:-/tmp}/joyhousebot-store.XXXXXX")
ZIP_PATH="$OUT_DIR/joyhousebot-${VERSION}-chrome-web-store.zip"

cleanup() {
  rm -rf "$STAGE_DIR"
}
trap cleanup EXIT INT TERM

mkdir -p "$OUT_DIR"
cp "$ROOT_DIR/manifest.json" "$ROOT_DIR/background.js" "$ROOT_DIR/auth_bridge.js" "$STAGE_DIR/"
cp -R "$ROOT_DIR/_locales" "$ROOT_DIR/content" "$ROOT_DIR/icons" "$ROOT_DIR/popup" "$STAGE_DIR/"

if find "$STAGE_DIR" -name '.DS_Store' -o -name '._*' | grep -q .; then
  echo "Refusing to package macOS metadata files" >&2
  exit 1
fi

if rg -n 'localhost|127\.0\.0\.1|http://app\.joyhouse|https?://[^\"'"'"'[:space:]]+\.(js|wasm)' "$STAGE_DIR"; then
  echo "Refusing to package development endpoints or apparent remote executable code" >&2
  exit 1
fi

node --check "$STAGE_DIR/background.js"
node --check "$STAGE_DIR/popup/popup.js"
node --check "$STAGE_DIR/content/content.js"
node --check "$STAGE_DIR/content/extractors.js"
node --check "$STAGE_DIR/auth_bridge.js"
node -e "JSON.parse(require('fs').readFileSync('$STAGE_DIR/manifest.json','utf8')); JSON.parse(require('fs').readFileSync('$STAGE_DIR/_locales/zh_CN/messages.json','utf8')); JSON.parse(require('fs').readFileSync('$STAGE_DIR/_locales/en/messages.json','utf8'))"

rm -f "$ZIP_PATH"
(cd "$STAGE_DIR" && zip -q -r "$ZIP_PATH" .)

if ! unzip -Z1 "$ZIP_PATH" | grep -Fxq 'manifest.json'; then
  echo "ZIP root validation failed: manifest.json is not at the ZIP root" >&2
  exit 1
fi
if unzip -Z1 "$ZIP_PATH" | grep -Eq '(^|/)(README|store|scripts|dist|\.DS_Store|\._)'; then
  echo "ZIP contains a non-runtime or metadata file" >&2
  exit 1
fi

echo "Created $ZIP_PATH"
shasum -a 256 "$ZIP_PATH"
unzip -l "$ZIP_PATH"
