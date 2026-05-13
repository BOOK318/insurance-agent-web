#!/usr/bin/env bash
set -euo pipefail

WHISPER_HOME="${WHISPER_HOME:-$HOME/.insurance-agent-runtime/whisper.cpp}"
MODEL_PATH="${WHISPER_MODEL_PATH:-$WHISPER_HOME/models/ggml-base.bin}"
HOST="${WHISPER_HOST:-127.0.0.1}"
PORT="${WHISPER_PORT:-9000}"
LANGUAGE="${WHISPER_LANGUAGE:-zh}"

cd "$WHISPER_HOME"
export DYLD_LIBRARY_PATH="$WHISPER_HOME/build/src:$WHISPER_HOME/build/ggml/src:$WHISPER_HOME/build/ggml/src/ggml-cpu:$WHISPER_HOME/build/ggml/src/ggml-blas:$WHISPER_HOME/build/ggml/src/ggml-metal:${DYLD_LIBRARY_PATH:-}"

exec "$WHISPER_HOME/build/bin/whisper-server" \
  -m "$MODEL_PATH" \
  --host "$HOST" \
  --port "$PORT" \
  --language "$LANGUAGE" \
  --no-gpu \
  --no-flash-attn
