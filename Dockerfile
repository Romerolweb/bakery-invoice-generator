# Dockerfile
# Base image with Node.js 18
FROM node:18-slim AS base

# Set working directory
WORKDIR /app

# Install dependencies
COPY package*.json ./
RUN npm ci

# Copy application code
COPY . .
# Ensure public directory exists, COPY . . should handle it if present
# but this can help if it's gitignored or empty locally during build
RUN mkdir -p /app/public 

# Build the Next.js application
RUN npm run build

# --- Production Stage ---
FROM node:18-slim AS production

ENV NODE_ENV=production
ENV PORT=3000
# Set a default for PDF_GENERATOR if not provided
ENV PDF_GENERATOR=pdfkit

# Install Puppeteer dependencies
# Based on https://pptr.dev/troubleshooting#chrome-doesnt-launch-on-linux
RUN apt-get update && apt-get install -y \
    ca-certificates \
    fonts-liberation \
    libappindicator3-1 \
    libasound2 \
    libatk-bridge2.0-0 \
    libatk1.0-0 \
    libc6 \
    libcairo2 \
    libcups2 \
    libdbus-1-3 \
    libexpat1 \
    libfontconfig1 \
    libgbm1 \
    libgcc1 \
    libglib2.0-0 \
    libgtk-3-0 \
    libnspr4 \
    libnss3 \
    libpango-1.0-0 \
    libpangocairo-1.0-0 \
    libstdc++6 \
    libx11-6 \
    libx11-xcb1 \
    libxcb1 \
    libxcomposite1 \
    libxcursor1 \
    libxdamage1 \
    libxext6 \
    libxfixes3 \
    libxi6 \
    libxrandr2 \
    libxrender1 \
    libxss1 \
    libxtst6 \
    lsb-release \
    wget \
    xdg-utils \
    --no-install-recommends \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy built artifacts from the build stage
COPY --from=base /app/.next ./.next
COPY --from=base /app/public ./public
COPY --from=base /app/package.json ./package.json
COPY --from=base /app/node_modules ./node_modules
# Copy other necessary files, e.g., next.config.js if it's not bundled or data files if they are static
COPY --from=base /app/next.config.ts ./next.config.ts
# If src/lib/data is accessed at runtime and not part of the build, copy it
COPY --from=base /app/src/lib/data ./src/lib/data
# Copy fonts if they are accessed directly by path from pdfkit or puppeteer (if not system fonts)
COPY --from=base /app/src/lib/fonts ./src/lib/fonts


# Expose port
EXPOSE ${PORT}

# Start the application
CMD ["npm", "start"]
