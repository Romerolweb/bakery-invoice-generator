# Bakery Invoice API

A professional invoice system backend built with Go, designed specifically for bakeries with Australian GST compliance.

## Features

- **RESTful API** with comprehensive OpenAPI documentation
- **SQLite Database** with automatic migrations (PostgreSQL for serverless)
- **Dual Deployment Architecture** - Single codebase for both traditional server and AWS Lambda serverless
- **Modular Serverless Design** - Each API domain can be deployed as separate Lambda functions
- **Intelligent Configuration** - Automatic adaptation between server and serverless modes
- **File Storage Abstraction** - Seamless switching between local filesystem and AWS S3
- **Email Integration** - Professional receipt delivery with PDF attachments
- **GST Compliance** - Australian tax requirements with automatic calculations
- **Docker Support** - Containerized deployment with persistent storage
- **Comprehensive Testing** - Unit, integration, and API contract tests
- **Deployment Validation** - Automated testing for both deployment modes

## Quick Start

### Prerequisites

- Go 1.24.6 or later
- SQLite 3 (for server mode) or PostgreSQL (for serverless mode)
- Docker (optional, for containerized deployment)
- AWS CLI (for Lambda deployment)
- Serverless Framework (for Lambda deployment)
- Node.js and npm (for Serverless Framework)

### Installation

1. **Automated Setup**
   ```bash
   chmod +x scripts/install.sh
   ./scripts/install.sh
   ```

2. **Manual Setup**
   ```bash
   # Install dependencies
   make install
   
   # Setup environment
   make setup-env
   
   # Run database migrations
   make migrate-up
   
   # Start development server
   make dev
   ```

### Using Make Commands

```bash
# Show all available commands
make help

# Development
make dev                 # Start development server
make dev-watch          # Start with hot reload (requires air)

# Building
make build              # Build server binary
make build-all          # Build server + Lambda functions
make lambda-build       # Build Lambda functions only

# Testing
make test               # Run all tests
make test-coverage      # Run tests with coverage
make test-integration   # Run integration tests

# Database
make migrate-up         # Run migrations
make migrate-down       # Rollback migrations
make migrate-create NAME=migration_name  # Create new migration

# Docker
make docker-build       # Build Docker image
make docker-run         # Run Docker container
make docker-compose-up  # Start with docker-compose

# Deployment
make deploy-lambda      # Deploy to AWS Lambda
make deploy-lambda-dev  # Deploy to Lambda (dev)
make deploy-lambda-prod # Deploy to Lambda (prod)

# Validation
make validate           # Validate both deployments
make validate-server    # Validate server deployment
make validate-lambda LAMBDA_URL=https://api.gateway.url  # Validate Lambda

# Utilities
make clean              # Clean build artifacts
make backup-db          # Backup database
make logs               # View application logs
```

## Project Structure

```
backend/
├── cmd/                    # Application entry points
│   ├── server/            # Traditional server
│   └── lambda/            # Lambda functions
├── internal/              # Private application code
│   ├── config/           # Configuration management
│   ├── handlers/         # HTTP handlers
│   ├── middleware/       # HTTP middleware
│   ├── core/             # Business logic (future)
│   └── adapters/         # External adapters (future)
├── pkg/                   # Public packages
│   ├── server/           # Server utilities
│   └── lambda/           # Lambda utilities
├── api/                   # OpenAPI specifications
├── migrations/            # Database migrations
├── templates/             # Email templates
├── deployments/           # Deployment configurations
│   ├── docker/           # Docker configurations
│   └── lambda/           # Serverless configurations
├── scripts/               # Build and deployment scripts
└── tests/                 # Test files
```

## API Documentation

Once the server is running, visit:
- **Swagger UI**: http://localhost:8081/swagger/index.html
- **OpenAPI Spec**: http://localhost:8081/swagger/doc.json
- **Health Check**: http://localhost:8081/health

## Configuration

### Environment Variables

Copy `.env.example` to `.env` and configure:

```bash
# Application
ENVIRONMENT=development
PORT=8081

# Database
DB_CONNECTION_STRING=./data/bakery.db

# Storage
STORAGE_TYPE=local
STORAGE_LOCAL_PATH=./data/files

# Email
SMTP_HOST=localhost
SMTP_PORT=587
SMTP_USERNAME=your-username
SMTP_PASSWORD=your-password
SMTP_FROM=noreply@bakery.local

# Security
JWT_SECRET=your-secret-key-change-in-production
```

### Database

The application uses SQLite by default with automatic migrations. The database file is stored in `data/bakery.db`.

#### Migration Commands

```bash
# Run all pending migrations
make migrate-up

# Rollback last migration
make migrate-down

# Create new migration
make migrate-create NAME=add_new_table
```

## Deployment Options

### 1. Docker Deployment

```bash
# Build and run with Docker
make docker-build
make docker-run

# Or use docker-compose
make docker-compose-up
```

### 2. AWS Lambda Deployment

```bash
# Configure AWS credentials
aws configure

# Deploy to Lambda
make deploy-lambda-dev    # Development
make deploy-lambda-prod   # Production
```

### 3. Traditional Server Deployment

```bash
# Build binary
make build

# Create deployment package
./scripts/deploy.sh -e prod -t server
```

## Development

### Hot Reload Development

Install Air for hot reload:
```bash
go install github.com/cosmtrek/air@latest
make dev-watch
```

### Code Quality

```bash
# Run linter
make lint

# Format code
make format

# Run tests with coverage
make test-coverage
```

### Database Development

```bash
# Create new migration
make migrate-create NAME=add_customer_notes

# Apply migrations
make migrate-up

# Rollback if needed
make migrate-down
```

## Testing

### Running Tests

```bash
# All tests
make test

# With coverage
make test-coverage

# Integration tests only
make test-integration
```

### Test Structure

- **Unit Tests**: `*_test.go` files alongside source code
- **Integration Tests**: `tests/integration/` directory
- **API Tests**: Test HTTP endpoints with real database

## Architecture

### Clean Architecture Principles

- **Handlers**: HTTP request/response handling
- **Services**: Business logic (future implementation)
- **DAOs**: Data access objects (future implementation)
- **Models**: Data structures and validation

### Serverless Ready

The application is designed to work both as:
- Traditional long-running server
- AWS Lambda functions (one per domain)

### Storage Abstraction

File storage is abstracted to support:
- Local filesystem (development)
- AWS S3 (production)

## Monitoring and Logging

### Structured Logging

The application uses structured logging with logrus:

```go
logrus.WithFields(logrus.Fields{
    "user_id": userID,
    "action": "create_receipt",
}).Info("Receipt created")
```

### Health Checks

Health endpoint at `/health` provides:
- Application status
- Database connectivity
- Storage availability
- Timestamp and version

### Metrics

Future implementation will include:
- Request metrics
- Business metrics
- Performance monitoring

## Security

### Authentication

JWT-based authentication (future implementation):
- Token-based API access
- Role-based authorization
- Secure password handling

### Data Protection

- Input validation with go-playground/validator
- SQL injection prevention with GORM
- XSS protection with proper encoding
- CORS configuration

## Contributing

### Development Setup

1. Fork the repository
2. Run `make install` to set up development environment
3. Create feature branch
4. Make changes with tests
5. Run `make test` and `make lint`
6. Submit pull request

### Code Standards

- Follow Go conventions
- Write tests for new features
- Update documentation
- Use structured logging
- Handle errors appropriately

## Troubleshooting

### Common Issues

1. **Database locked error**
   ```bash
   # Stop all processes using the database
   make clean
   make migrate-up
   ```

2. **Port already in use**
   ```bash
   # Change port in .env file
   PORT=8082
   ```

3. **Migration errors**
   ```bash
   # Check migration files
   ls migrations/
   # Rollback and retry
   make migrate-down
   make migrate-up
   ```

### Logs

```bash
# View application logs
make logs

# Docker logs
docker logs bakery-invoice-api

# Lambda logs
aws logs tail /aws/lambda/bakery-invoice-api-dev-customers
```

## License

MIT License - see LICENSE file for details.

## Support

For support and questions:
- Create an issue in the repository
- Check the troubleshooting section
- Review the API documentation