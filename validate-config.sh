#!/bin/bash

# Environment Configuration Validator
# This script validates environment variables and configuration consistency

echo "🔍 Environment Configuration Validator"
echo "====================================="

# Function to check if file exists
check_file() {
    if [ -f "$1" ]; then
        echo "✅ Found: $1"
        return 0
    else
        echo "❌ Missing: $1"
        return 1
    fi
}

# Function to validate environment file
validate_env_file() {
    local env_file="$1"
    echo ""
    echo "📋 Validating $env_file:"
    
    if [ ! -f "$env_file" ]; then
        echo "❌ File not found: $env_file"
        return 1
    fi
    
    # Source the file and check variables
    source "$env_file"
    
    # Check PORT
    if [ -n "$PORT" ]; then
        echo "✅ PORT=$PORT"
    else
        echo "❌ PORT variable not set"
    fi
    
    # Check NODE_ENV
    if [ -n "$NODE_ENV" ]; then
        echo "✅ NODE_ENV=$NODE_ENV"
    else
        echo "❌ NODE_ENV variable not set"
    fi
    
}

# Check essential files
echo ""
echo "📁 Checking essential files:"
check_file "package.json"
check_file "next.config.ts"
check_file "docker-compose.yml"
check_file "Dockerfile"
check_file ".env.example"

# Check environment files
echo ""
echo "🌍 Checking environment files:"
check_file ".env.dev"
check_file ".env.prod"

# Validate environment files
if [ -f ".env.dev" ]; then
    validate_env_file ".env.dev"
fi

if [ -f ".env.prod" ]; then
    validate_env_file ".env.prod"
fi

# Check startup scripts
echo ""
echo "🚀 Checking startup scripts:"
if [ -f "dev.sh" ] && [ -x "dev.sh" ]; then
    echo "✅ dev.sh (executable)"
else
    echo "❌ dev.sh (missing or not executable)"
fi

if [ -f "start.sh" ] && [ -x "start.sh" ]; then
    echo "✅ start.sh (executable)"
else
    echo "❌ start.sh (missing or not executable)"
fi

# Check package.json scripts
echo ""
echo "📦 Checking package.json scripts:"
if grep -q "\"dev\":" package.json; then
    echo "✅ dev script found"
else
    echo "❌ dev script missing"
fi

if grep -q "\"start\":" package.json; then
    echo "✅ start script found"
else
    echo "❌ start script missing"
fi

# Port consistency check
echo ""
echo "🔗 Checking port consistency:"

# Extract ports from different files
DEV_PORT=$(grep "PORT=" .env.dev 2>/dev/null | cut -d'=' -f2)
PROD_PORT=$(grep "PORT=" .env.prod 2>/dev/null | cut -d'=' -f2)
COMPOSE_PORT=$(grep -A5 "ports:" docker-compose.yml 2>/dev/null | grep -o "\${PORT:-[0-9]*}" | head -1 | grep -o "[0-9]*")

echo "Development port (.env.dev): ${DEV_PORT:-'not set'}"
echo "Production port (.env.prod): ${PROD_PORT:-'not set'}"
echo "Docker Compose default: ${COMPOSE_PORT:-'not found'}"

# Summary
echo ""
echo "✨ Validation complete!"
echo ""
echo "💡 Quick setup commands:"
echo "   Development: ./dev.sh"
echo "   Production:  ./start.sh"
echo "   Docker:      docker-compose up --build"
