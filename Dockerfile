FROM python:3.11-slim

WORKDIR /app

# 系统依赖：curl 用于归档流程的兜底抓取
RUN apt-get update \
    && apt-get install -y --no-install-recommends curl \
    && rm -rf /var/lib/apt/lists/*

# 仅复制必要的应用文件，减少构建上下文
COPY app/requirements.txt ./requirements.txt
RUN pip install --no-cache-dir -r requirements.txt
COPY app/ .

# 准备默认数据/日志目录与持久化文件（可通过挂载覆盖）
RUN mkdir -p /app/data /app/logs \
    && touch /app/cookie.txt /app/config.json /app/tokens.json

EXPOSE 8000
VOLUME ["/app/data", "/app/logs", "/app/config.json", "/app/tokens.json", "/app/cookie.txt"]
CMD ["uvicorn", "server:app", "--host", "0.0.0.0", "--port", "8000"]
