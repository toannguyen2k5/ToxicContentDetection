# ============================================================
# Qwen Tier-3 — Ollama with GPU support
# Base: ollama/ollama:latest (CUDA built-in, no compilation)
# Engine: llama.cpp (same as llama-cpp-python, same quality)
# Model: mounted from host as /models/qwen3-4b-q4_k_m.gguf
# ============================================================
FROM ollama/ollama:latest

# Copy Modelfile và entrypoint
COPY docker/Modelfile /Modelfile
COPY docker/ollama-entrypoint.sh /entrypoint.sh

# Cài curl để health check trong entrypoint
RUN apt-get update && apt-get install -y --no-install-recommends curl \
    && rm -rf /var/lib/apt/lists/* \
    && chmod +x /entrypoint.sh

# Ollama chạy trên port 11434
EXPOSE 11434

# Entrypoint tự động start server + load model
ENTRYPOINT ["/entrypoint.sh"]
