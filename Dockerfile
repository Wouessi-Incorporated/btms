FROM node:20-alpine
WORKDIR /app

# Copy package files first for better caching
COPY server/package.json server/package-lock.json* ./server/

# Install dependencies
RUN cd server && npm install --omit=dev

# Copy application files
COPY public ./public
COPY server ./server

# Set production environment
ENV NODE_ENV=production

# Expose port
EXPOSE 3000

# Set working directory to server
WORKDIR /app/server

# Start the application
CMD ["node","index.js"]


