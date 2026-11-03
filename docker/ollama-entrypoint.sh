#!/bin/bash
# ============================================================
# Ollama entrypoint: start server + load GGUF model on boot
# ============================================================
set -e

MODEL_NAME="${OLLAMA_MODEL_NAME:-qwen3-4b-local}"
MODELFILE_PATH="/Modelfile"
MODEL_FILE="/models/qwen3-4b-q4_k_m.gguf"

echo "=== Qwen Tier-3 via Ollama ==="
echo "Model: $MODEL_NAME"
echo "GGUF:  $MODEL_FILE"

# Kiểm tra file GGUF tồn tại
if [ ! -f "$MODEL_FILE" ]; then
    echo "ERROR: GGUF file not found at $MODEL_FILE"
    echo "Mount volume: ./src/tier3_qwen/models/Qwen3-4B-GGUF:/models:ro"
    exit 1
fi

# Start Ollama server trong background
ollama serve &
OLLAMA_PID=$!

# Chờ server sẵn sàng
echo "Waiting for Ollama server to start..."
for i in $(seq 1 30); do
    if curl -sf http://localhost:11434/api/tags > /dev/null 2>&1; then
        echo "Ollama server ready (${i}s)."
        break
    fi
    sleep 1
done

# Tạo model từ GGUF nếu chưa có
if ollama list 2>/dev/null | grep -q "$MODEL_NAME"; then
    echo "Model '$MODEL_NAME' already loaded."
else
    echo "Creating model '$MODEL_NAME' from GGUF..."
    ollama create "$MODEL_NAME" -f "$MODELFILE_PATH"
    echo "Model '$MODEL_NAME' created successfully."
fi

echo "=== Ollama ready. Listening on :11434 ==="

# Giữ server chạy
wait $OLLAMA_PID
