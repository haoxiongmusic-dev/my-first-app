#!/usr/bin/env bash
# Smoke test for the container image (run by GitHub after building it, no GPU there):
# the server starts with logins on, the gate works, a login works, and a 2-second Draft render
# inside the container produces a playable video. Usage: scripts/smoke-image.sh <image>
set -euo pipefail

IMAGE="$1"
NAME="smoke-$$"
PORT=3000
cleanup() { docker rm -f "$NAME" >/dev/null 2>&1 || true; }
trap cleanup EXIT

fail() {
  echo "SMOKE FAILED: $*" >&2
  docker logs "$NAME" 2>&1 | tail -40 >&2 || true
  exit 1
}

# A throwaway test account and secret, made only for this run.
SECRET="$(head -c 36 /dev/urandom | base64 | tr -d '/+=\n' | head -c 48)"
# (--entrypoint skips the CUDA base image's start-up banner, which would mix into the output)
ACCOUNT="$(docker run --rm --entrypoint npx "$IMAGE" tsx -e \
  "import('./src/lib/auth/passwords.ts').then(m => console.log('smoke:' + m.hashPassword('smoke-password-1')))" \
  | tail -1)"
case "$ACCOUNT" in
  smoke:scrypt\$*) ;;
  *) echo "SMOKE FAILED: couldn't make the test account: $ACCOUNT" >&2; exit 1 ;;
esac

docker run -d --name "$NAME" -p "$PORT:3000" \
  -e ACCOUNTS="$ACCOUNT" -e SESSION_SECRET="$SECRET" -e GPU_CHECK=0 \
  -e STORAGE_DIR=/tmp/storage "$IMAGE" >/dev/null

for _ in $(seq 1 120); do
  curl -s -o /dev/null "http://localhost:$PORT/login" && break
  sleep 1
done

code() { curl -s -o /dev/null -w '%{http_code}' "$@"; }
[ "$(code "http://localhost:$PORT/login")" = 200 ] || fail "/login is not 200"
[ "$(code "http://localhost:$PORT/")" = 307 ] || fail "/ does not redirect to the login page"
[ "$(code "http://localhost:$PORT/api/songs")" = 401 ] || fail "/api/songs is not locked"

JAR="$(mktemp)"
[ "$(code -c "$JAR" -H 'content-type: application/json' \
  -d '{"username":"smoke","password":"smoke-password-1"}' \
  "http://localhost:$PORT/api/auth/login")" = 200 ] || fail "login failed"
HEALTH="$(curl -s -b "$JAR" "http://localhost:$PORT/api/health")"
echo "health: $HEALTH"
echo "$HEALTH" | grep -q '"gpu"' || fail "/api/health did not answer after login"

# A real 2-second Draft render of a generated tone (software drawing: no GPU here).
docker exec "$NAME" bash -c '
  set -e
  ffmpeg -loglevel error -f lavfi -i "sine=frequency=220:duration=3" -ac 2 /tmp/tone.wav
  npm run render -- halo-rings /tmp/tone.wav --start 0 --end 2 --quality draft
  OUT="$(ls test-renders/*.mp4 | head -1)"
  DUR="$(ffprobe -v error -show_entries format=duration -of csv=p=0 "$OUT")"
  echo "rendered $OUT ($DUR s)"
  awk -v d="$DUR" "BEGIN { exit !(d > 1.5 && d < 2.5) }"
' || fail "the test render did not produce a 2-second video"

echo "SMOKE OK"
