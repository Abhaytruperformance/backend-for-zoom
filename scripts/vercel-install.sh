#!/bin/sh
# Invoked by vercel.json#installCommand, which has already moved us to the workspace
# root. Vercel runs install from the project's Root Directory (server/), where
# `--workspaces` has no workspaces to expand and only the server's dependencies get
# installed — 257 packages instead of 319, leaving the client without react or
# @types/react and the build dying in JSX.IntrinsicElements errors.
set -e
npm install --include-workspace-root --workspaces
