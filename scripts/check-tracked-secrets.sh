#!/usr/bin/env bash
set -euo pipefail

repo_root="$(git rev-parse --show-toplevel)"
cd "$repo_root"

echo "Checking tracked files for accidental secrets..."

tracked_env_files="$(
  git ls-files \
    | rg '(^|/)\.env($|\.)' \
    | rg -v '\.example$' \
    || true
)"

tracked_key_files="$(
  git ls-files \
    | rg '(^|/)(GoogleService-Info\.plist|google-services\.json)$|(\.(pem|p8|key|crt|cer|der|jks|keystore|mobileprovision)$)' \
    || true
)"

content_hits="$(
  git grep -n -I -E -e \
    '-----BEGIN ([A-Z0-9 ]+)?PRIVATE KEY-----|postgres(ql)?://[^[:space:]\[]+:[^[:space:]\[]+@|ghp_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,}|sk_(live|test)_[A-Za-z0-9]+|sk-[A-Za-z0-9]{20,}|AIza[0-9A-Za-z_-]{35}|xox[baprs]-[A-Za-z0-9-]{10,}' \
    -- . \
    ':(exclude)api/.env.example' \
    ':(exclude)ml/.env.example' \
    ':(exclude)mobile/.env.example' \
    ':(exclude)mobile/.env.production.example' \
    || true
)"

has_issue=0

if [[ -n "$tracked_env_files" ]]; then
  has_issue=1
  echo
  echo "Tracked env files found:"
  printf '%s\n' "$tracked_env_files"
fi

if [[ -n "$tracked_key_files" ]]; then
  has_issue=1
  echo
  echo "Tracked secret key or credential files found:"
  printf '%s\n' "$tracked_key_files"
fi

if [[ -n "$content_hits" ]]; then
  has_issue=1
  echo
  echo "Tracked files with secret-looking content found:"
  printf '%s\n' "$content_hits"
fi

if [[ "$has_issue" -ne 0 ]]; then
  echo
  echo "Secret check failed. Move real secrets into ignored local env files before pushing."
  exit 1
fi

echo "No tracked secret files or obvious secret values found."
