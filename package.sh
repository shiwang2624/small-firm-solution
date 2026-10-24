#!/bin/bash
# Build SmallFirm Solution.app — requires: npm install
set -euo pipefail
ROOT="$(cd "$(dirname "$0")" && pwd)"
cd "$ROOT"

SRC="node_modules/electron/dist/Electron.app"
BUILD="$ROOT/build"
APP="$BUILD/SmallFirm Solution.app"

[ -d "$SRC" ] || { echo "Electron missing at $SRC — run: npm install" >&2; exit 1; }

echo "==> Copying Electron runtime"
rm -rf "$BUILD"; mkdir -p "$BUILD"
cp -R "$SRC" "$APP"

echo "==> Installing app payload"
mkdir -p "$APP/Contents/Resources/app"
cp package.json main.js preload.js "$APP/Contents/Resources/app/"
cp -R renderer "$APP/Contents/Resources/app/"
rm -f "$APP/Contents/Resources/default_app.asar"

echo "==> App icon"
if [ -f brand/app.icns ]; then
  cp brand/app.icns "$APP/Contents/Resources/app.icns"
  rm -f "$APP/Contents/Resources/electron.icns"
fi

echo "==> Rebranding Info.plist"
P="$APP/Contents/Info.plist"
set_plist() {
  /usr/libexec/PlistBuddy -c "Set :$1 $2" "$P" 2>/dev/null \
    || /usr/libexec/PlistBuddy -c "Add :$1 string $2" "$P"
}
set_plist CFBundleName "SmallFirm Solution"
set_plist CFBundleDisplayName "SmallFirm Solution"
set_plist CFBundleIdentifier "com.smallfirm.solution"
set_plist CFBundleShortVersionString "3.0.0"
set_plist CFBundleVersion "1"
set_plist CFBundleIconFile "app.icns"
set_plist NSCameraUsageDescription "SmallFirm Solution uses the camera only to scan product barcodes and QR codes."
set_plist NSHumanReadableCopyright "SmallFirm Solution"

echo "==> Ad-hoc signing"
xattr -dr com.apple.quarantine "$APP" 2>/dev/null || true
codesign --force --deep --sign - "$APP" >/dev/null 2>&1 || echo "(ad-hoc sign skipped)"

echo "==> Built: $APP"
