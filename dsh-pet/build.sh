#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "${BASH_SOURCE[0]}")"
npm run build
DSH_PET_ALLOW_ELECTRON_DOWNLOAD=1 npm run dist
