#!/bin/bash

# Bakery Invoice API Installation Script
# This script sets up the development environment

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${BLUE}🍞 Bakery Invoice API Installation${NC}"
echo "=================================="

# Check if Go is installed
echo -e "${YELLOW}Checking Go installation...${NC}"
if ! command -v go &> /dev/null; then
    echo -e "${RED}❌ Go is not installed${NC}"
    echo -e "${YELLOW}Please install Go 1.21 or later from https://golang.org/dl/${NC}"
    exit 1
fi

GO_VERSION=$(go version | awk '{print $3}' | sed 's/go//')
echo -e "${GREEN}✅ Go ${GO_VERSION} is installed${NC}"

# Check Go version
REQUIRED_VERSION="1.21"
if ! printf '%s\n%s\n' "$REQUIRED_VERSION" "$GO_VERSION" | sort -V -C; then
    echo -e "${RED}❌ Go version ${GO_VERSION} is too old. Please upgrade to Go ${REQUIRED_VERSION} or later${NC}"
    exit 1
fi

# Create project directories
echo -e "${YELLOW}Creating project directories...${NC}"
mkdir -p data/files
mkdir -p bin
mkdir -p logs
mkdir -p backups
echo -e "${GREEN}✅ Project directories created${NC}"

# Install Go dependencies
echo -e "${YELLOW}Installing Go dependencies...${NC}"
go mod download
go mod tidy
echo -e "${GREEN}✅ Go dependencies installed${NC}"

# Setup environment file
echo -e "${YELLOW}Setting up environment configuration...${NC}"
if [ ! -f .env ]; then
    cp .env.example .env
    echo -e "${GREEN}✅ Environment file created from template${NC}"
    echo -e "${YELLOW}⚠️  Please review and update .env file with your configuration${NC}"
else
    echo -e "${YELLOW}⚠️  .env file already exists, skipping...${NC}"
fi

# Check for optional tools
echo -e "${YELLOW}Checking optional tools...${NC}"

# Docker
if command -v docker &> /dev/null; then
    echo -e "${GREEN}✅ Docker is available${NC}"
else
    echo -e "${YELLOW}⚠️  Docker is not installed (optional for containerized deployment)${NC}"
fi

# Serverless Framework
if command -v serverless &> /dev/null; then
    echo -e "${GREEN}✅ Serverless Framework is available${NC}"
else
    echo -e "${YELLOW}⚠️  Serverless Framework is not installed (optional for AWS Lambda deployment)${NC}"
    echo -e "${YELLOW}   Install with: npm install -g serverless${NC}"
fi

# golang-migrate
if command -v migrate &> /dev/null; then
    echo -e "${GREEN}✅ golang-migrate is available${NC}"
else
    echo -e "${YELLOW}⚠️  golang-migrate is not installed (required for database migrations)${NC}"
    echo -e "${YELLOW}   Installing golang-migrate...${NC}"
    go install -tags 'sqlite3' github.com/golang-migrate/migrate/v4/cmd/migrate@latest
    if command -v migrate &> /dev/null; then
        echo -e "${GREEN}✅ golang-migrate installed successfully${NC}"
    else
        echo -e "${RED}❌ Failed to install golang-migrate${NC}"
        echo -e "${YELLOW}   Please install manually: go install -tags 'sqlite3' github.com/golang-migrate/migrate/v4/cmd/migrate@latest${NC}"
    fi
fi

# golangci-lint
if command -v golangci-lint &> /dev/null; then
    echo -e "${GREEN}✅ golangci-lint is available${NC}"
else
    echo -e "${YELLOW}⚠️  golangci-lint is not installed (optional for code linting)${NC}"
    echo -e "${YELLOW}   Install with: go install github.com/golangci/golangci-lint/cmd/golangci-lint@latest${NC}"
fi

# Air (for hot reload)
if command -v air &> /dev/null; then
    echo -e "${GREEN}✅ Air is available for hot reload${NC}"
else
    echo -e "${YELLOW}⚠️  Air is not installed (optional for hot reload during development)${NC}"
    echo -e "${YELLOW}   Install with: go install github.com/cosmtrek/air@latest${NC}"
fi

# Run database migrations
echo -e "${YELLOW}Setting up database...${NC}"
if command -v migrate &> /dev/null; then
    if [ -f "migrations/001_initial_schema.up.sql" ]; then
        migrate -path migrations -database "sqlite3://data/bakery.db" up
        echo -e "${GREEN}✅ Database migrations completed${NC}"
    else
        echo -e "${YELLOW}⚠️  Migration files not found, skipping database setup${NC}"
    fi
else
    echo -e "${YELLOW}⚠️  Skipping database setup (migrate tool not available)${NC}"
fi

# Build the application
echo -e "${YELLOW}Building application...${NC}"
make build
echo -e "${GREEN}✅ Application built successfully${NC}"

# Installation complete
echo ""
echo -e "${GREEN}🎉 Installation completed successfully!${NC}"
echo ""
echo -e "${BLUE}Next steps:${NC}"
echo -e "1. Review and update the ${YELLOW}.env${NC} file with your configuration"
echo -e "2. Start the development server: ${YELLOW}make dev${NC}"
echo -e "3. Visit the API documentation: ${YELLOW}http://localhost:8081/swagger/index.html${NC}"
echo -e "4. Check the health endpoint: ${YELLOW}http://localhost:8081/health${NC}"
echo ""
echo -e "${BLUE}Available commands:${NC}"
echo -e "  ${YELLOW}make help${NC}     - Show all available commands"
echo -e "  ${YELLOW}make dev${NC}      - Start development server"
echo -e "  ${YELLOW}make test${NC}     - Run tests"
echo -e "  ${YELLOW}make build${NC}    - Build the application"
echo ""