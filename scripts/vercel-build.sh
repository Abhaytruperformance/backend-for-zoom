#!/bin/sh
# Invoked by vercel.json#buildCommand, which has already moved us to the workspace root
# and passed the directory it started in as $ORIG.
#
# Vercel resolves outputDirectory relative to the project's Root Directory, not the repo
# root, so a client build left in <repo>/client/dist is not where Vercel looks. Building
# at the workspace root and copying the result to $ORIG/dist puts it exactly where
# outputDirectory ("dist") resolves to, whatever the Root Directory is set to.
set -e

npm run build --workspace client

SRC="$PWD/client/dist"
DEST="${ORIG:-$PWD}/dist"

# Skipped when they are the same path — true if Root Directory ever points at client/,
# where rm -rf would otherwise destroy the artifact it is about to copy.
if [ "$SRC" != "$DEST" ]; then
  rm -rf "$DEST"
  cp -R "$SRC" "$DEST"
fi
