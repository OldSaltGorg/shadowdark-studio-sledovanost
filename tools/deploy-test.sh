#!/usr/bin/env bash
# Copy the working tree to the test Foundry instance's Data/modules folder.
# Only copies runtime files; never touches worlds or containers.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
HOST="${DEPLOY_HOST:-gorg@nasdum.app}"
DEST="${DEPLOY_DEST:-/home/gorg/docker/foundryShadowdark/Data/modules/shadowdark-studio-sledovanost/}"
rsync -av --delete \
  --include='module.json' --include='LICENSE' --include='README.md' \
  --include='scripts/***' --include='styles/***' --include='templates/***' \
  --include='lang/***' --include='data/***' --exclude='*' \
  "$ROOT/" "$HOST:$DEST"
