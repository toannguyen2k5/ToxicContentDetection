# docker/api.Dockerfile
FROM python:3.10-slim

WORKDIR /app

# System deps cần cho torch / tokenizers / build wheels
# + wget: py_vncorenlp.download_model() gọi wget qua shell
# + default-jdk-headless: pyjnius (dùng bởi py_vncorenlp) cần JDK có javac,
#   chỉ cài JRE sẽ báo "Unable to find javac"
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    git \
    wget \
    default-jdk-headless \
    && rm -rf /var/lib/apt/lists/*

ENV JAVA_HOME=/usr/lib/jvm/default-java
RUN test -x "$JAVA_HOME/bin/javac" && javac -version

# Cài dependency trước để tận dụng docker layer cache
COPY requirements.txt .
RUN pip install --no-cache-dir --upgrade pip \
    && pip install --no-cache-dir -r requirements.txt

# Tải VnCoreNLP ngay lúc build, đặt NGOÀI /app để volume mount không che mất.
# tokenizer.py đọc đường dẫn này qua biến môi trường VNCORENLP_HOME.
ENV VNCORENLP_HOME=/opt/vncorenlp
RUN mkdir -p "$VNCORENLP_HOME" \
    && cd "$VNCORENLP_HOME" \
    && python -c "import py_vncorenlp; py_vncorenlp.download_model(save_dir='$VNCORENLP_HOME')" \
    && test -f "$VNCORENLP_HOME/VnCoreNLP-1.2.jar" \
    && test -f "$VNCORENLP_HOME/models/wordsegmenter/wordsegmenter.rdr"

# Copy code (KHÔNG copy model weights lớn, sẽ mount volume ở compose)
COPY src/ ./src/
COPY api/ ./api/

ENV PYTHONUNBUFFERED=1 \
    PYTHONPATH=/app

EXPOSE 8000

CMD ["uvicorn", "api.main:app", "--host", "0.0.0.0", "--port", "8000"]
