# Bash wrappers for env-shadow. Source this file from ~/.bashrc.

_ENV_SHADOW_ROOT="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
_ENV_SHADOW_BIN="${ENV_SHADOW_BIN:-${_ENV_SHADOW_ROOT}/bin/env-shadow}"

_env_shadow_is_dotenv() {
  local base="${1##*/}"
  [[ "$base" == '.env' || "$base" == .env.* || "$base" == *.env || "$base" == *.env.* ]]
}

_env_shadow_cleanup_dirs() {
  local dir
  for dir in "$@"; do
    rm -rf -- "$dir"
  done
}

_env_shadow_run_wrapped() {
  local command_name="$1"
  shift

  local -a args=("$@") temp_dirs=()
  local i arg temp_dir temp_file status

  for i in "${!args[@]}"; do
    arg="${args[i]}"
    if [[ -f "$arg" ]] && _env_shadow_is_dotenv "$arg"; then
      temp_dir="$(mktemp -d "${TMPDIR:-/tmp}/env-shadow.XXXXXXXX")" || {
        printf 'env-shadow: failed to create temporary directory\n' >&2
        _env_shadow_cleanup_dirs "${temp_dirs[@]}"
        return 1
      }
      chmod 700 "$temp_dir"
      temp_file="$temp_dir/${arg##*/}"

      if ! "$_ENV_SHADOW_BIN" -- "$arg" > "$temp_file"; then
        _env_shadow_cleanup_dirs "$temp_dir" "${temp_dirs[@]}"
        return 1
      fi
      chmod 600 "$temp_file"
      args[i]="$temp_file"
      temp_dirs+=("$temp_dir")
    fi
  done

  command "$command_name" "${args[@]}"
  status=$?
  _env_shadow_cleanup_dirs "${temp_dirs[@]}"
  return "$status"
}

cat() {
  _env_shadow_run_wrapped "${ENV_SHADOW_CAT_COMMAND:-cat}" "$@"
}

less() {
  _env_shadow_run_wrapped "${ENV_SHADOW_LESS_COMMAND:-less}" "$@"
}
