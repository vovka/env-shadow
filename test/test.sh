#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
BIN="$ROOT/bin/env-shadow"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

pass=0
fail=0

assert_eq() {
  local name="$1" expected="$2" actual="$3"
  if [[ "$actual" == "$expected" ]]; then
    printf 'ok - %s\n' "$name"
    ((pass+=1))
  else
    printf 'not ok - %s\nexpected: <%s>\nactual:   <%s>\n' "$name" "$expected" "$actual"
    ((fail+=1))
  fi
}

assert_eq 'explicit secret marker' \
  'PASSWORD=cor...ple # secret' \
  "$(printf '%s\n' 'PASSWORD=correct-horse-battery-staple # secret' | "$BIN" --no-auto)"

assert_eq 'shadow marker is case insensitive' \
  'VALUE=abc...hij # SHADOW' \
  "$(printf '%s\n' 'VALUE=abcdefghij # SHADOW' | "$BIN" --no-auto)"

assert_eq 'automatic token detection' \
  'GITHUB_TOKEN=ghp...def' \
  "$(printf '%s\n' 'GITHUB_TOKEN=ghp_1234567890abcdef' | "$BIN")"

assert_eq 'public marker overrides automatic detection' \
  'DEMO_PASSWORD=not-sensitive # public' \
  "$(printf '%s\n' 'DEMO_PASSWORD=not-sensitive # public' | "$BIN")"

assert_eq 'quoted values and comments are preserved' \
  'export API_KEY = "abc...hij" # deployment key # secret' \
  "$(printf '%s\n' 'export API_KEY = "abcdefghij" # deployment key # secret' | "$BIN")"

assert_eq 'hash inside a quoted value is not a comment' \
  'PASSWORD="abc...xyz" # secret' \
  "$(printf '%s\n' 'PASSWORD="abc#123#xyz" # secret' | "$BIN")"

assert_eq 'short secrets are fully masked' \
  'PIN=**** # secret' \
  "$(printf '%s\n' 'PIN=1234 # secret' | "$BIN" --no-auto)"

assert_eq 'custom keep width' \
  'TOKEN=ab...ij # secret' \
  "$(printf '%s\n' 'TOKEN=abcdefghij # secret' | "$BIN" --keep 2 --no-auto)"

assert_eq 'database URL is automatically detected' \
  'DATABASE_URL=pos.../db' \
  "$(printf '%s\n' 'DATABASE_URL=postgres://user:password@host/db' | "$BIN")"

multiline_input=$'PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\nvery-secret-key-material\n-----END PRIVATE KEY-----" # secret'
assert_eq 'multiline secrets are collapsed safely' \
  'PRIVATE_KEY="<multiline secret hidden>" # secret' \
  "$(printf '%s\n' "$multiline_input" | "$BIN")"

multiline_public=$'PRIVATE_KEY="first line\nsecond line" # public'
assert_eq 'public marker preserves multiline values' \
  "$multiline_public" \
  "$(printf '%s\n' "$multiline_public" | "$BIN")"

assert_eq 'automatic detection can be disabled' \
  'API_TOKEN=abcdefghij' \
  "$(printf '%s\n' 'API_TOKEN=abcdefghij' | "$BIN" --no-auto)"

cat > "$TMP/.env" <<'ENV'
NAME=demo
PASSWORD=correct-horse-battery-staple # secret
ENV

wrapper_output="$({
  export ENV_SHADOW_BIN="$BIN"
  source "$ROOT/shell/env-shadow.bash"
  cat "$TMP/.env"
})"
assert_eq 'cat wrapper redacts dotenv files' \
  $'NAME=demo\nPASSWORD=cor...ple # secret' \
  "$wrapper_output"

cat > "$TMP/plain.txt" <<'TXT'
PASSWORD=correct-horse-battery-staple # secret
TXT
plain_output="$({
  export ENV_SHADOW_BIN="$BIN"
  source "$ROOT/shell/env-shadow.bash"
  cat "$TMP/plain.txt"
})"
assert_eq 'cat wrapper leaves non-dotenv files untouched' \
  'PASSWORD=correct-horse-battery-staple # secret' \
  "$plain_output"

less_output="$({
  export ENV_SHADOW_BIN="$BIN"
  export ENV_SHADOW_LESS_COMMAND=cat
  source "$ROOT/shell/env-shadow.bash"
  less "$TMP/.env"
})"
assert_eq 'less wrapper uses a redacted temporary file' \
  $'NAME=demo\nPASSWORD=cor...ple # secret' \
  "$less_output"

printf '\n%d passed, %d failed\n' "$pass" "$fail"
((fail == 0))
