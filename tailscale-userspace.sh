#!/bin/bash
set -euo pipefail

SOCK="/tmp/tailscaled.sock"
STATE="/tmp/tailscaled.state"

# Clean up stale socket to avoid "address already in use"
rm -f "$SOCK"

exec /usr/local/bin/tailscaled \
  --tun=userspace-networking \
  --socket="$SOCK" \
  --state="$STATE"
