FROM python:3.9-slim

# Install LibreOffice and other dependencies
RUN apt-get update && apt-get install -y \
    libreoffice-writer \
    default-jre \
    libreoffice-java-common \
    && apt-get clean \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

ENV PORT=10000
EXPOSE 10000

CMD ["sh", "-c", "gunicorn app:app --bind 0.0.0.0:$PORT"]
