FROM node:20-alpine
WORKDIR /app
COPY package.json ./
RUN npm install --production
COPY server.js ./
RUN mkdir -p .cache

ENV CACHE_PORT=4000
ENV CACHE_DIR=/app/.cache
# CACHE_TOKEN 必须在运行时传入

EXPOSE 4000
CMD ["node", "server.js"]
