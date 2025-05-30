#!/bin/bash

# Development startup script
# This script loads environment variables and starts the development server

# Default environment file
ENV_FILE=".env.dev"

# Check if custom env file is specified
if [ "$1" != "" ]; then
    ENV_FILE="$1"
fi

# Check if environment file exists
if [ ! -f "$ENV_FILE" ]; then
    echo "Environment file $ENV_FILE not found!"
    echo "Creating default environment file..."
    cp .env.example "$ENV_FILE"
fi

# Load environment variables
export $(cat "$ENV_FILE" | grep -v '^#' | xargs)

# Start the development server
echo "Starting development server on port $PORT..."
npx next dev --turbopack --port "$PORT"
