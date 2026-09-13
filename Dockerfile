# Stage 1: build the Vite bundle
FROM node:20-alpine AS frontend

WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

# Stage 2: build the API
FROM golang:1.24-alpine AS backend

WORKDIR /src
COPY server/go.mod server/go.sum ./
RUN go mod download
COPY server/ ./
RUN CGO_ENABLED=0 GOOS=linux go build -trimpath -ldflags="-s -w" -o /out/tempo-api ./cmd/server

# Stage 3: nginx serves the bundle and proxies /api to the binary
FROM alpine:3.20

RUN apk add --no-cache nginx supervisor ca-certificates \
    && mkdir -p /run/nginx /var/log/supervisor

COPY --from=frontend /app/dist /usr/share/nginx/html
COPY --from=backend /out/tempo-api /usr/local/bin/tempo-api
COPY nginx.conf /etc/nginx/http.d/default.conf
COPY supervisord.conf /etc/supervisord.conf

EXPOSE 80

CMD ["/usr/bin/supervisord", "-c", "/etc/supervisord.conf"]
