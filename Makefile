# Bakery Invoice Generator - Root Makefile
# This Makefile provides convenient commands for the entire project

# Colors for output
RED=\033[0;31m
GREEN=\033[0;32m
YELLOW=\033[1;33m
BLUE=\033[0;34m
NC=\033[0m # No Color

.PHONY: help setup install dev build test lint format clean pre-commit backend frontend

# Default target
help: ## Show this help message
	@echo "$(BLUE)Bakery Invoice Generator - Available Commands$(NC)"
	@echo ""
	@awk 'BEGIN {FS = ":.*?## "} /^[a-zA-Z_-]+:.*?## / {printf "$(GREEN)%-20s$(NC) %s\n", $1, $2}' $(MAKEFILE_LIST)

# Setup and Installation
setup: ## Complete project setup (install dependencies, setup pre-commit, etc.)
	@echo "$(YELLOW)Setting up Bakery Invoice Generator...$(NC)"
	@./setup.sh
	@$(MAKE) pre-commit-setup
	@echo "$(GREEN)✅ Setup completed!$(NC)"

install: ## Install all dependencies (frontend and backend)
	@echo "$(YELLOW)Installing dependencies...$(NC)"
	@npm install
	@cd backend && go mod download && go mod tidy
	@echo "$(GREEN)✅ Dependencies installed$(NC)"

# Development
dev: ## Start development servers (frontend and backend)
	@echo "$(YELLOW)Starting development servers...$(NC)"
	@./dev.sh

dev-frontend: ## Start only frontend development server
	@echo "$(YELLOW)Starting frontend development server...$(NC)"
	@npm run dev

dev-backend: ## Start only backend development server
	@echo "$(YELLOW)Starting backend development server...$(NC)"
	@cd backend && make dev

# Building
build: ## Build both frontend and backend
	@echo "$(YELLOW)Building project...$(NC)"
	@npm run build
	@cd backend && make build
	@echo "$(GREEN)✅ Build completed$(NC)"

build-frontend: ## Build only frontend
	@echo "$(YELLOW)Building frontend...$(NC)"
	@npm run build

build-backend: ## Build only backend
	@echo "$(YELLOW)Building backend...$(NC)"
	@cd backend && make build

# Testing
test: ## Run all tests (frontend and backend)
	@echo "$(YELLOW)Running all tests...$(NC)"
	@npm run test:run
	@cd backend && make test
	@echo "$(GREEN)✅ All tests completed$(NC)"

test-frontend: ## Run only frontend tests
	@echo "$(YELLOW)Running frontend tests...$(NC)"
	@npm run test:run

test-backend: ## Run only backend tests
	@echo "$(YELLOW)Running backend tests...$(NC)"
	@cd backend && make test

# Code Quality
lint: ## Run linters for all code
	@echo "$(YELLOW)Running linters...$(NC)"
	@npm run lint
	@cd backend && make lint
	@echo "$(GREEN)✅ Linting completed$(NC)"

lint-fix: ## Run linters with auto-fix
	@echo "$(YELLOW)Running linters with auto-fix...$(NC)"
	@npm run lint:fix
	@cd backend && make lint
	@echo "$(GREEN)✅ Linting with fixes completed$(NC)"

format: ## Format all code
	@echo "$(YELLOW)Formatting code...$(NC)"
	@npm run pretty
	@cd backend && make format
	@echo "$(GREEN)✅ Code formatting completed$(NC)"

typecheck: ## Run TypeScript type checking
	@echo "$(YELLOW)Running type checking...$(NC)"
	@npm run typecheck
	@echo "$(GREEN)✅ Type checking completed$(NC)"

# Pre-commit Hooks
pre-commit-setup: ## Setup pre-commit hooks
	@echo "$(YELLOW)Setting up pre-commit hooks...$(NC)"
	@./scripts/setup-pre-commit.sh

pre-commit-run: ## Run pre-commit hooks on all files
	@echo "$(YELLOW)Running pre-commit hooks...$(NC)"
	@pre-commit run --all-files

pre-commit-update: ## Update pre-commit hooks to latest versions
	@echo "$(YELLOW)Updating pre-commit hooks...$(NC)"
	@pre-commit autoupdate

# Database
migrate: ## Run database migrations
	@echo "$(YELLOW)Running database migrations...$(NC)"
	@cd backend && make migrate-up

migrate-json: ## Migrate JSON data to SQLite
	@echo "$(YELLOW)Migrating JSON data to SQLite...$(NC)"
	@cd backend && make migrate-json

# Docker
docker-build: ## Build Docker images
	@echo "$(YELLOW)Building Docker images...$(NC)"
	@docker-compose build

docker-up: ## Start services with Docker Compose
	@echo "$(YELLOW)Starting services with Docker Compose...$(NC)"
	@docker-compose up -d

docker-down: ## Stop Docker services
	@echo "$(YELLOW)Stopping Docker services...$(NC)"
	@docker-compose down

# Deployment
deploy-lambda: ## Deploy to AWS Lambda
	@echo "$(YELLOW)Deploying to AWS Lambda...$(NC)"
	@cd backend && make deploy-lambda

deploy-lambda-dev: ## Deploy to AWS Lambda (dev environment)
	@echo "$(YELLOW)Deploying to AWS Lambda (dev)...$(NC)"
	@cd backend && make deploy-lambda-dev

deploy-lambda-prod: ## Deploy to AWS Lambda (prod environment)
	@echo "$(YELLOW)Deploying to AWS Lambda (prod)...$(NC)"
	@cd backend && make deploy-lambda-prod

# Validation
validate: ## Run all validation checks
	@echo "$(YELLOW)Running validation checks...$(NC)"
	@$(MAKE) lint
	@$(MAKE) typecheck
	@$(MAKE) test
	@$(MAKE) build
	@echo "$(GREEN)✅ All validation checks passed$(NC)"

validate-config: ## Validate configuration files
	@echo "$(YELLOW)Validating configuration files...$(NC)"
	@./validate-config.sh

# Cleanup
clean: ## Clean build artifacts and dependencies
	@echo "$(YELLOW)Cleaning build artifacts...$(NC)"
	@rm -rf .next
	@rm -rf node_modules/.cache
	@rm -rf dist
	@cd backend && make clean
	@echo "$(GREEN)✅ Cleanup completed$(NC)"

clean-all: ## Clean everything including node_modules
	@echo "$(YELLOW)Cleaning everything...$(NC)"
	@rm -rf node_modules
	@rm -rf .next
	@rm -rf dist
	@cd backend && make clean
	@echo "$(GREEN)✅ Deep cleanup completed$(NC)"

# Backend shortcuts
backend: ## Access backend-specific commands (use: make backend COMMAND=target)
	@cd backend && make $(COMMAND)

# Frontend shortcuts  
frontend: ## Access frontend-specific commands
	@echo "$(BLUE)Frontend Commands:$(NC)"
	@echo "  dev, build, test, lint, typecheck"

# Quick development workflow
quick-start: ## Quick start for new developers
	@echo "$(BLUE)🚀 Quick start for new developers...$(NC)"
	@$(MAKE) install
	@$(MAKE) pre-commit-setup
	@$(MAKE) migrate
	@echo "$(GREEN)🎉 Ready for development!$(NC)"
	@echo "$(BLUE)Next steps:$(NC)"
	@echo "  1. Run: $(YELLOW)make dev$(NC)"
	@echo "  2. Open: $(YELLOW)http://localhost:9002$(NC)"

# CI/CD workflow
ci: ## Run CI/CD pipeline locally
	@echo "$(BLUE)🔄 Running CI/CD pipeline locally...$(NC)"
	@$(MAKE) install
	@$(MAKE) lint
	@$(MAKE) typecheck
	@$(MAKE) test
	@$(MAKE) build
	@echo "$(GREEN)✅ CI/CD pipeline completed successfully!$(NC)"

# Security
security-scan: ## Run security scans
	@echo "$(YELLOW)Running security scans...$(NC)"
	@pre-commit run gitleaks --all-files
	@cd backend && make lint | grep -i security || true
	@echo "$(GREEN)✅ Security scan completed$(NC)"

# Documentation
docs: ## Generate/update documentation
	@echo "$(YELLOW)Updating documentation...$(NC)"
	@echo "$(BLUE)Available documentation:$(NC)"
	@echo "  - README.md"
	@echo "  - docs/PRE_COMMIT_SETUP.md"
	@echo "  - backend/README.md"
	@echo "  - API docs: http://localhost:8081/swagger/index.html (when backend is running)"

# Health check
health: ## Check project health
	@echo "$(YELLOW)Checking project health...$(NC)"
	@echo "$(BLUE)Node.js version:$(NC) $$(node --version)"
	@echo "$(BLUE)npm version:$(NC) $$(npm --version)"
	@echo "$(BLUE)Go version:$(NC) $$(go version)"
	@echo "$(BLUE)Pre-commit version:$(NC) $$(pre-commit --version 2>/dev/null || echo 'Not installed')"
	@echo "$(BLUE)Docker version:$(NC) $$(docker --version 2>/dev/null || echo 'Not installed')"
	@echo "$(GREEN)✅ Health check completed$(NC)"