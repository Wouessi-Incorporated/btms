FROM node:20-alpine
WORKDIR /app
COPY server/package.json server/package-lock.json* ./server/
RUN cd server && npm install --omit=dev
COPY public ./public
COPY server ./server
ENV NODE_ENV=production
EXPOSE 3000
WORKDIR /app/server
CMD ["node","index.js"]
