#!/usr/bin/env bash
set -euo pipefail

DATA_HOME="${XDG_DATA_HOME:-$HOME/.local/share}"
BIN_HOME="${XDG_BIN_HOME:-$HOME/.local/bin}"
INSTALL_DIR="$DATA_HOME/env-shadow"
BASHRC="${ENV_SHADOW_BASHRC:-$HOME/.bashrc}"
SOURCE_LINE="source \"$INSTALL_DIR/shell/env-shadow.bash\""

if [[ -f "$BASHRC" ]]; then
  tmp="$(mktemp)"
  grep -Fvx "$SOURCE_LINE" "$BASHRC" | grep -Fvx '# Redact secrets when cat/less displays dotenv files.' > "$tmp" || true
  cat "$tmp" > "$BASHRC"
  rm -f "$tmp"
fi

if [[ -L "$BIN_HOME/env-shadow" ]] && [[ "$(readlink "$BIN_HOME/env-shadow")" == "$INSTALL_DIR/bin/env-shadow" ]]; then
  rm -f "$BIN_HOME/env-shadow"
fi
rm -rf "$INSTALL_DIR"
printf 'Uninstalled env-shadow. Open a new shell to remove the wrappers.\n'
