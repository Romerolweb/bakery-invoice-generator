# Bakery Invoice API Makefile

# Variables
BINARY_NAME=bakery-invoice-api
DOCKER_IMAGE=bakery-invoice-api
DOCKER_TAG=latest
GO_VERSION=1.24.6

# Colors for output
RED=\033[0;31m
GREEN=\033[0;32m
YELLOW=\033[1;33m
BLUE=\033[0;34m
NC=\033[0m # No Color

.PHONY: help install build test clean docker-build docker-run lambda-build deploy-lambda dev prod

# Default target
help: ## Show this help message
	@echo "$(BLUE)Bakery Invoice API - Available Commands$(NC)"
	@echo ""
	@awk 'BEGIN {FS = ":.*?## "} /^[a-zA-Z_-]+:.*?## / {printf "$(GREEN)%-20s$(NC) %s\n", $$1, $$2}' $(MAKEFILE_LIST)

# Installation and Setup
install: ## Install dependencies and setup development environment
	@echo "$(YELLOW)Installing dependencies...$(NC)"
	@if ! command -v go >/dev/null 2>&1; then \
		echo "$(RED)Go is not installed. Please install Go $(GO_VERSION) or later.$(NC)"; \
		exit 1; \
	fi
	@echo "$(GREEN)✓ Go is installed$(NC)"
	@go mod download
	@go mod tidy
	@echo "$(GREEN)✓ Go dependencies installed$(NC)"
	@if ! command -v docker >/dev/null 2>&1; then \
		echo "$(YELLOW)⚠ Docker is not installed. Docker commands will not work.$(NC)"; \
	else \
		echo "$(GREEN)✓ Docker is available$(NC)"; \
	fi
	@if ! command -v serverless >/dev/null 2>&1; then \
		echo "$(YELLOW)⚠ Serverless Framework is not installed. Lambda deployment will not work.$(NC)"; \
		echo "$(YELLOW)  Install with: npm install -g serverless$(NC)"; \
	else \
		echo "$(GREEN)✓ Serverless Framework is available$(NC)"; \
	fi
	@mkdir -p data/files
	@mkdir -p bin
	@mkdir -p logs
	@echo "$(GREEN)✓ Project directories created$(NC)"
	@echo "$(GREEN)🎉 Installation complete!$(NC)"

# Development
dev: ## Start development server with hot reload
	@echo "$(YELLOW)Starting development server...$(NC)"
	@if [ ! -f .env ]; then \
		echo "$(YELLOW)Creating .env file from template...$(NC)"; \
		cp .env.example .env 2>/dev/null || echo "# Development environment variables" > .env; \
	fi
	@export $$(cat .env | xargs) && go run cmd/server/main.go

dev-watch: ## Start development server with file watching (requires air)
	@echo "$(YELLOW)Starting development server with hot reload...$(NC)"
	@if ! command -v air >/dev/null 2>&1; then \
		echo "$(RED)Air is not installed. Installing...$(NC)"; \
		go install github.com/cosmtrek/air@latest; \
	fi
	@air

# Building
build: ## Build the server binary
	@echo "$(YELLOW)Building server binary...$(NC)"
	@./scripts/build.sh -t server
	@echo "$(GREEN)✓ Server binary built$(NC)"

build-all: ## Build all binaries (server + lambda functions)
	@echo "$(YELLOW)Building all binaries...$(NC)"
	@./scripts/build.sh -t all
	@echo "$(GREEN)✓ All binaries built$(NC)"

lambda-build: ## Build Lambda function binaries
	@echo "$(YELLOW)Building Lambda functions...$(NC)"
	@./scripts/build.sh -t lambda
	@echo "$(GREEN)✓ All Lambda functions built$(NC)"

# Testing
test: ## Run all tests
	@echo "$(YELLOW)Running tests...$(NC)"
	@go test -v ./...

test-coverage: ## Run tests with coverage report
	@echo "$(YELLOW)Running tests with coverage...$(NC)"
	@go test -v -coverprofile=coverage.out ./...
	@go tool cover -html=coverage.out -o coverage.html
	@echo "$(GREEN)✓ Coverage report generated: coverage.html$(NC)"

test-integration: ## Run integration tests
	@echo "$(YELLOW)Running integration tests...$(NC)"
	@go test -v -tags=integration ./tests/integration/...

# Code Quality
lint: ## Run linter
	@echo "$(YELLOW)Running linter...$(NC)"
	@if ! command -v golangci-lint >/dev/null 2>&1; then \
		echo "$(RED)golangci-lint is not installed. Installing...$(NC)"; \
		go install github.com/golangci/golangci-lint/cmd/golangci-lint@latest; \
	fi
	@golangci-lint run

format: ## Format code
	@echo "$(YELLOW)Formatting code...$(NC)"
	@go fmt ./...
	@goimports -w .

# Database
migrate-up: ## Run database migrations up
	@echo "$(YELLOW)Running database migrations...$(NC)"
	@go run cmd/migrate/main.go -action=up -db=./data/bakery.db -migrations=./migrations
	@echo "$(GREEN)✓ Database migrations completed$(NC)"

migrate-down: ## Run database migrations down
	@echo "$(YELLOW)Rolling back database migrations...$(NC)"
	@go run cmd/migrate/main.go -action=down -db=./data/bakery.db -migrations=./migrations
	@echo "$(GREEN)✓ Database migrations rolled back$(NC)"

migrate-status: ## Show migration status
	@echo "$(YELLOW)Checking migration status...$(NC)"
	@go run cmd/migrate/main.go -action=status -db=./data/bakery.db -migrations=./migrations

migrate-validate: ## Validate database schema
	@echo "$(YELLOW)Validating database schema...$(NC)"
	@go run cmd/migrate/main.go -action=validate -db=./data/bakery.db -migrations=./migrations
	@echo "$(GREEN)✓ Schema validation completed$(NC)"

migrate-json: ## Migrate data from JSON files to SQLite
	@echo "$(YELLOW)Migrating JSON data to SQLite...$(NC)"
	@go run cmd/json-migrate/main.go -action=migrate -db=./data/bakery.db -json=../src/lib/data
	@echo "$(GREEN)✓ JSON migration completed$(NC)"

migrate-json-check: ## Check for JSON files ready for migration
	@echo "$(YELLOW)Checking for JSON files...$(NC)"
	@go run cmd/json-migrate/main.go -action=check -json=../src/lib/data

migrate-json-validate: ## Validate JSON migration results
	@echo "$(YELLOW)Validating JSON migration...$(NC)"
	@go run cmd/json-migrate/main.go -action=validate -db=./data/bakery.db -json=../src/lib/data
	@echo "$(GREEN)✓ JSON migration validation completed$(NC)"

migrate-json-dry-run: ## Perform a dry run of JSON migration
	@echo "$(YELLOW)Performing JSON migration dry run...$(NC)"
	@go run cmd/json-migrate/main.go -action=migrate -db=./data/bakery.db -json=../src/lib/data -dry-run
	@echo "$(GREEN)✓ JSON migration dry run completed$(NC)"

migrate-full: ## Complete migration from JSON to SQLite (recommended)
	@echo "$(YELLOW)Running complete JSON to SQLite migration...$(NC)"
	@./scripts/migrate-json.sh
	@echo "$(GREEN)✓ Complete migration finished$(NC)"

migrate-full-dry-run: ## Complete migration dry run
	@echo "$(YELLOW)Running complete migration dry run...$(NC)"
	@./scripts/migrate-json.sh --dry-run
	@echo "$(GREEN)✓ Complete migration dry run finished$(NC)"

migrate-create: ## Create a new migration file (usage: make migrate-create NAME=migration_name)
	@if [ -z "$(NAME)" ]; then \
		echo "$(RED)Please provide a migration name: make migrate-create NAME=migration_name$(NC)"; \
		exit 1; \
	fi
	@if ! command -v migrate >/dev/null 2>&1; then \
		echo "$(RED)golang-migrate is not installed. Please install it first.$(NC)"; \
		echo "$(YELLOW)Install with: go install -tags 'sqlite3' github.com/golang-migrate/migrate/v4/cmd/migrate@latest$(NC)"; \
		exit 1; \
	fi
	@migrate create -ext sql -dir migrations $(NAME)
	@echo "$(GREEN)✓ Migration files created for: $(NAME)$(NC)"

# Docker
docker-build: ## Build Docker image
	@echo "$(YELLOW)Building Docker image...$(NC)"
	@docker build -t $(DOCKER_IMAGE):$(DOCKER_TAG) .
	@echo "$(GREEN)✓ Docker image built: $(DOCKER_IMAGE):$(DOCKER_TAG)$(NC)"

docker-run: ## Run Docker container
	@echo "$(YELLOW)Running Docker container...$(NC)"
	@docker run -d \
		--name $(BINARY_NAME) \
		-p 8081:8081 \
		-v $(PWD)/data:/data \
		-e ENVIRONMENT=development \
		$(DOCKER_IMAGE):$(DOCKER_TAG)
	@echo "$(GREEN)✓ Docker container started$(NC)"
	@echo "$(BLUE)API available at: http://localhost:8081$(NC)"
	@echo "$(BLUE)Health check: http://localhost:8081/health$(NC)"
	@echo "$(BLUE)API docs: http://localhost:8081/swagger/index.html$(NC)"

docker-stop: ## Stop Docker container
	@echo "$(YELLOW)Stopping Docker container...$(NC)"
	@docker stop $(BINARY_NAME) || true
	@docker rm $(BINARY_NAME) || true
	@echo "$(GREEN)✓ Docker container stopped$(NC)"

docker-compose-up: ## Start services with docker-compose
	@echo "$(YELLOW)Starting services with docker-compose...$(NC)"
	@docker-compose -f ../docker-compose.backend.yml up -d
	@echo "$(GREEN)✓ Services started$(NC)"

docker-compose-down: ## Stop services with docker-compose
	@echo "$(YELLOW)Stopping services with docker-compose...$(NC)"
	@docker-compose -f ../docker-compose.backend.yml down
	@echo "$(GREEN)✓ Services stopped$(NC)"

# Deployment
deploy-lambda: ## Deploy to AWS Lambda
	@echo "$(YELLOW)Deploying to AWS Lambda...$(NC)"
	@if ! command -v serverless >/dev/null 2>&1; then \
		echo "$(RED)Serverless Framework is not installed.$(NC)"; \
		echo "$(YELLOW)Install with: npm install -g serverless$(NC)"; \
		exit 1; \
	fi
	@$(MAKE) lambda-build
	@cd deployments/lambda && serverless deploy
	@echo "$(GREEN)✓ Lambda deployment completed$(NC)"

deploy-lambda-dev: ## Deploy to AWS Lambda (dev stage)
	@$(MAKE) deploy-lambda STAGE=dev

deploy-lambda-prod: ## Deploy to AWS Lambda (prod stage)
	@$(MAKE) deploy-lambda STAGE=prod

# Production
prod: ## Start production server
	@echo "$(YELLOW)Starting production server...$(NC)"
	@if [ ! -f bin/$(BINARY_NAME) ]; then \
		echo "$(YELLOW)Binary not found. Building...$(NC)"; \
		$(MAKE) build; \
	fi
	@export ENVIRONMENT=production && ./bin/$(BINARY_NAME)

# Utilities
clean: ## Clean build artifacts
	@echo "$(YELLOW)Cleaning build artifacts...$(NC)"
	@rm -rf bin/
	@rm -rf coverage.out coverage.html
	@rm -rf logs/*.log
	@go clean
	@echo "$(GREEN)✓ Clean completed$(NC)"

backup-db: ## Backup database
	@echo "$(YELLOW)Backing up database...$(NC)"
	@mkdir -p backups
	@cp data/bakery.db backups/bakery_$(shell date +%Y%m%d_%H%M%S).db
	@echo "$(GREEN)✓ Database backed up$(NC)"

restore-db: ## Restore database (usage: make restore-db FILE=backup_file.db)
	@if [ -z "$(FILE)" ]; then \
		echo "$(RED)Please provide a backup file: make restore-db FILE=backup_file.db$(NC)"; \
		exit 1; \
	fi
	@echo "$(YELLOW)Restoring database from $(FILE)...$(NC)"
	@cp $(FILE) data/bakery.db
	@echo "$(GREEN)✓ Database restored$(NC)"

logs: ## View application logs
	@echo "$(YELLOW)Viewing application logs...$(NC)"
	@tail -f logs/app.log

# Environment setup
setup-env: ## Setup environment files
	@echo "$(YELLOW)Setting up environment files...$(NC)"
	@if [ ! -f .env ]; then \
		echo "# Bakery Invoice API Environment Variables" > .env; \
		echo "ENVIRONMENT=development" >> .env; \
		echo "PORT=8081" >> .env; \
		echo "DB_CONNECTION_STRING=./data/bakery.db" >> .env; \
		echo "STORAGE_TYPE=local" >> .env; \
		echo "STORAGE_LOCAL_PATH=./data/files" >> .env; \
		echo "JWT_SECRET=your-secret-key-change-in-production" >> .env; \
		echo "SMTP_HOST=localhost" >> .env; \
		echo "SMTP_PORT=587" >> .env; \
		echo "SMTP_USERNAME=" >> .env; \
		echo "SMTP_PASSWORD=" >> .env; \
		echo "SMTP_FROM=noreply@bakery.local" >> .env; \
		echo "$(GREEN)✓ .env file created$(NC)"; \
	else \
		echo "$(YELLOW).env file already exists$(NC)"; \
	fi

# Quick start
quick-start: ## Quick start for development (install + migrate + dev)
	@echo "$(BLUE)🚀 Quick start for development...$(NC)"
	@$(MAKE) install
	@$(MAKE) setup-env
	@$(MAKE) migrate-up
	@echo "$(GREEN)🎉 Setup complete! Starting development server...$(NC)"
	@$(MAKE) dev

# Full deployment
full-deploy: ## Full deployment (build + test + deploy)
	@echo "$(BLUE)🚀 Full deployment process...$(NC)"
	@$(MAKE) clean
	@$(MAKE) build-all
	@$(MAKE) test
	@$(MAKE) deploy-lambda
	@echo "$(GREEN)🎉 Full deployment completed!$(NC)"

# Validation
validate: ## Validate both server and lambda deployments
	@echo "$(YELLOW)Validating deployments...$(NC)"
	@./scripts/validate-deployment.sh -m both

validate-server: ## Validate server deployment only
	@echo "$(YELLOW)Validating server deployment...$(NC)"
	@./scripts/validate-deployment.sh -m server

validate-lambda: ## Validate lambda deployment only (requires LAMBDA_URL)
	@echo "$(YELLOW)Validating lambda deployment...$(NC)"
	@if [ -z "$(LAMBDA_URL)" ]; then \
		echo "$(RED)Please provide LAMBDA_URL: make validate-lambda LAMBDA_URL=https://your-api-gateway-url$(NC)"; \
		exit 1; \
	fi
	@./scripts/validate-deployment.sh -m lambda -l $(LAMBDA_URL)