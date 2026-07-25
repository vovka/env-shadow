#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
DATA_HOME="${XDG_DATA_HOME:-$HOME/.local/share}"
BIN_HOME="${XDG_BIN_HOME:-$HOME/.local/bin}"
INSTALL_DIR="$DATA_HOME/env-shadow"
BASHRC="${ENV_SHADOW_BASHRC:-$HOME/.bashrc}"
SOURCE_LINE="source \"$INSTALL_DIR/shell/env-shadow.bash\""

mkdir -p "$INSTALL_DIR/bin" "$INSTALL_DIR/shell" "$BIN_HOME"
install -m 0755 "$ROOT/bin/env-shadow" "$INSTALL_DIR/bin/env-shadow"
install -m 0644 "$ROOT/shell/env-shadow.bash" "$INSTALL_DIR/shell/env-shadow.bash"
ln -sfn "$INSTALL_DIR/bin/env-shadow" "$BIN_HOME/env-shadow"

touch "$BASHRC"
if ! grep -Fqx "$SOURCE_LINE" "$BASHRC"; then
  {
    printf '\n# Redact secrets when cat/less displays dotenv files.\n'
    printf '%s\n' "$SOURCE_LINE"
  } >> "$BASHRC"
fi

printf 'Installed env-shadow.\n'
printf 'Run: source %q\n' "$BASHRC"
if [[ ":$PATH:" != *":$BIN_HOME:"* ]]; then
  printf 'Also add %s to PATH to call env-shadow directly.\n' "$BIN_HOME"
fi
