FROM node:24-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM node:24-alpine AS runtime
WORKDIR /app
RUN apk add --no-cache docker-cli
ENV NODE_ENV=production
COPY package*.json ./
RUN npm ci --omit=dev
COPY --from=build /app/server ./server
COPY --from=build /app/agent ./agent
COPY --from=build /app/dist ./dist
COPY --from=build /app/templates ./templates
EXPOSE 7788
CMD ["node", "server/index.js"]
