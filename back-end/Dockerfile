FROM node:20-alpine3.21

WORKDIR /app

# Install system dependencies
RUN apk add --no-cache ffmpeg bash

# Copy package files
COPY package.json package-lock.json ./

# Install production dependencies
RUN npm ci --production

# Copy application files
COPY . ./

# Verify FFmpeg installation
RUN ffmpeg -version && echo "FFmpeg installed successfully"

# Start the application
CMD ["npm", "start"]