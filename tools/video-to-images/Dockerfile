# 使用 Python 基礎映像檔
FROM python:3.10-slim

# 設定工作目錄
WORKDIR /app

# 複製專案檔案
#COPY . /screenshot

#COPY . /createFile

COPY . /app

RUN apt-get update && apt-get install -y \
    libgl1-mesa-glx \
    libglib2.0-0

# 安裝所需的 Python 套件（如果有 requirements.txt）
RUN pip install --no-cache-dir -r requirements.txt || true

# 設定容器啟動時執行的命令
CMD ["/bin/bash"]