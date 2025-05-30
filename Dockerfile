# Dockerfile
# Base image with Node.js 18
FROM node:22-alpine AS base

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
FROM node:22-alpine AS production

ENV NODE_ENV=production
ENV PORT=${PORT:-3000}
# Set a default for PDF_GENERATOR if not provided
ENV PDF_GENERATOR=${PDF_GENERATOR:-pdfkit}

# Install Puppeteer dependencies for Alpine
# Based on https://pptr.dev/troubleshooting#chrome-doesnt-launch-on-linux
RUN apk add --no-cache \
    chromium \
    nss \
    freetype \
    freetype-dev \
    harfbuzz \
    ca-certificates \
    ttf-freefont

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
