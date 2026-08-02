ARG BUILD_FROM=ghcr.io/home-assistant/base:latest
FROM ${BUILD_FROM}

RUN apk add --no-cache nodejs npm

WORKDIR /app

COPY src/package*.json ./
RUN npm ci --omit=dev

COPY src/ .

COPY run.sh /run.sh
RUN chmod +x /run.sh

CMD ["/run.sh"]
