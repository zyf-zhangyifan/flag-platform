FROM node:24-alpine AS web
WORKDIR /src/web
COPY web/package*.json ./
RUN npm ci
COPY web/ ./
RUN npm run build

FROM golang:1.27-alpine AS api
WORKDIR /src/backend
COPY backend/go.mod backend/go.sum ./
RUN go mod download
COPY backend/ ./
RUN CGO_ENABLED=0 go build -trimpath -o /flagstudio .

FROM alpine:3.22
RUN apk add --no-cache ca-certificates && addgroup -S app && adduser -S -G app app
WORKDIR /app
COPY --from=api /flagstudio ./flagstudio
COPY --from=web /src/web/dist ./public
ENV HTTP_ADDR=0.0.0.0:8080 STATIC_DIR=/app/public
USER app
EXPOSE 8080
CMD ["./flagstudio"]
