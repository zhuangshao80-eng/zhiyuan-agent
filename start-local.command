#!/bin/sh

cd "$(dirname "$0")" || exit 1
export PATH="$PWD/.local-node/bin:$PATH"
exec "$PWD/npm" start
