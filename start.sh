#!/bin/bash

# Production startup script
# This script loads production environment variables and starts the server

# Default environment file
ENV_FILE=".env.prod"

# Check if custom env file is specified
if [ "$1" != "" ]; then
    ENV_FILE="$1"
fi

# Check if environment file exists
if [ ! -f "$ENV_FILE" ]; then
    echo "Environment file $ENV_FILE not found!"
    echo "Creating default production environment file..."
    cp .env.example "$ENV_FILE"
    # Update defaults for production
    sed -i '' 's/PORT=9002/PORT=3000/' "$ENV_FILE"
    sed -i '' 's/NODE_ENV=development/NODE_ENV=production/' "$ENV_FILE"
fi

# Load environment variables
export $(cat "$ENV_FILE" | grep -v '^#' | xargs)

# Build and start the production server
echo "Building application..."
npm run build

echo "Starting production server on port $PORT..."
npx next start --port "$PORT"
