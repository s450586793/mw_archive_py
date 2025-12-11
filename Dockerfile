FROM python:3.11-slim
WORKDIR /app

# 系统依赖：curl 用于归档流程的兜底抓取
RUN apt-get update \
    && apt-get install -y --no-install-recommends curl \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt
COPY . .
# 默认端口
EXPOSE 8000
# 挂载目录：data 为下载目录，logs 为日志
VOLUME ["/app/data", "/app/logs"]
CMD ["uvicorn", "server:app", "--host", "0.0.0.0", "--port", "8000"]
