FROM node:22-alpine

WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3002
ENV HOST=0.0.0.0
ENV SIGNAGE_DATA_DIR=/data
ENV SIGNAGE_UPLOAD_DIR=/data/uploads

COPY package.json ./
COPY server.mjs ./
COPY cli.mjs ./
COPY public ./public

RUN mkdir -p /data/uploads

EXPOSE 3002
VOLUME ["/data"]

CMD ["node", "server.mjs"]
