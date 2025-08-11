#!/bin/bash

# Bakery Invoice API Deployment Script
# This script handles deployment to different environments

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Default values
ENVIRONMENT="dev"
DEPLOYMENT_TYPE="docker"

# Parse command line arguments
while [[ $# -gt 0 ]]; do
    case $1 in
        -e|--environment)
            ENVIRONMENT="$2"
            shift 2
            ;;
        -t|--type)
            DEPLOYMENT_TYPE="$2"
            shift 2
            ;;
        -h|--help)
            echo "Usage: $0 [OPTIONS]"
            echo ""
            echo "Options:"
            echo "  -e, --environment ENV    Deployment environment (dev, staging, prod)"
            echo "  -t, --type TYPE         Deployment type (docker, lambda, server)"
            echo "  -h, --help              Show this help message"
            echo ""
            echo "Examples:"
            echo "  $0 -e dev -t docker      Deploy to dev environment using Docker"
            echo "  $0 -e prod -t lambda     Deploy to production using AWS Lambda"
            echo "  $0 -e staging -t server  Deploy to staging as a server binary"
            exit 0
            ;;
        *)
            echo -e "${RED}Unknown option: $1${NC}"
            exit 1
            ;;
    esac
done

echo -e "${BLUE}🚀 Bakery Invoice API Deployment${NC}"
echo "=================================="
echo -e "${YELLOW}Environment: ${ENVIRONMENT}${NC}"
echo -e "${YELLOW}Deployment Type: ${DEPLOYMENT_TYPE}${NC}"
echo ""

# Validate environment
case $ENVIRONMENT in
    dev|staging|prod)
        ;;
    *)
        echo -e "${RED}❌ Invalid environment: ${ENVIRONMENT}${NC}"
        echo -e "${YELLOW}Valid environments: dev, staging, prod${NC}"
        exit 1
        ;;
esac

# Pre-deployment checks
echo -e "${YELLOW}Running pre-deployment checks...${NC}"

# Check if Go is installed
if ! command -v go &> /dev/null; then
    echo -e "${RED}❌ Go is not installed${NC}"
    exit 1
fi

# Run tests
echo -e "${YELLOW}Running tests...${NC}"
if ! make test; then
    echo -e "${RED}❌ Tests failed${NC}"
    exit 1
fi
echo -e "${GREEN}✅ Tests passed${NC}"

# Build application
echo -e "${YELLOW}Building application...${NC}"
case $DEPLOYMENT_TYPE in
    docker)
        make build
        ;;
    lambda)
        make lambda-build
        ;;
    server)
        make build
        ;;
    *)
        echo -e "${RED}❌ Invalid deployment type: ${DEPLOYMENT_TYPE}${NC}"
        exit 1
        ;;
esac
echo -e "${GREEN}✅ Build completed${NC}"

# Deploy based on type
case $DEPLOYMENT_TYPE in
    docker)
        echo -e "${YELLOW}Deploying with Docker...${NC}"
        
        # Build Docker image
        docker build -t bakery-invoice-api:${ENVIRONMENT} .
        
        # Tag for registry if not dev
        if [ "$ENVIRONMENT" != "dev" ]; then
            # Assuming you have a registry configured
            REGISTRY=${DOCKER_REGISTRY:-"your-registry.com"}
            docker tag bakery-invoice-api:${ENVIRONMENT} ${REGISTRY}/bakery-invoice-api:${ENVIRONMENT}
            docker push ${REGISTRY}/bakery-invoice-api:${ENVIRONMENT}
            echo -e "${GREEN}✅ Docker image pushed to registry${NC}"
        fi
        
        # Deploy with docker-compose
        if [ -f "docker-compose.${ENVIRONMENT}.yml" ]; then
            docker-compose -f docker-compose.${ENVIRONMENT}.yml up -d
        else
            docker-compose -f ../docker-compose.backend.yml up -d
        fi
        
        echo -e "${GREEN}✅ Docker deployment completed${NC}"
        ;;
        
    lambda)
        echo -e "${YELLOW}Deploying to AWS Lambda...${NC}"
        
        # Check if serverless is installed
        if ! command -v serverless &> /dev/null; then
            echo -e "${RED}❌ Serverless Framework is not installed${NC}"
            echo -e "${YELLOW}Install with: npm install -g serverless${NC}"
            exit 1
        fi
        
        # Check AWS credentials
        if ! aws sts get-caller-identity &> /dev/null; then
            echo -e "${RED}❌ AWS credentials not configured${NC}"
            echo -e "${YELLOW}Configure with: aws configure${NC}"
            exit 1
        fi
        
        # Deploy with serverless
        cd deployments/lambda
        serverless deploy --stage ${ENVIRONMENT}
        cd ../..
        
        echo -e "${GREEN}✅ Lambda deployment completed${NC}"
        ;;
        
    server)
        echo -e "${YELLOW}Deploying as server binary...${NC}"
        
        # Create deployment package
        DEPLOY_DIR="deploy-${ENVIRONMENT}-$(date +%Y%m%d-%H%M%S)"
        mkdir -p ${DEPLOY_DIR}
        
        # Copy binary and required files
        cp bin/bakery-invoice-api ${DEPLOY_DIR}/
        cp -r migrations ${DEPLOY_DIR}/
        cp -r templates ${DEPLOY_DIR}/
        cp .env.example ${DEPLOY_DIR}/.env
        
        # Create systemd service file
        cat > ${DEPLOY_DIR}/bakery-invoice-api.service << EOF
[Unit]
Description=Bakery Invoice API
After=network.target

[Service]
Type=simple
User=bakery
WorkingDirectory=/opt/bakery-invoice-api
ExecStart=/opt/bakery-invoice-api/bakery-invoice-api
Restart=always
RestartSec=5
Environment=ENVIRONMENT=${ENVIRONMENT}

[Install]
WantedBy=multi-user.target
EOF
        
        # Create deployment script
        cat > ${DEPLOY_DIR}/deploy.sh << 'EOF'
#!/bin/bash
set -e

echo "Installing Bakery Invoice API..."

# Create user
sudo useradd -r -s /bin/false bakery || true

# Create directories
sudo mkdir -p /opt/bakery-invoice-api
sudo mkdir -p /var/lib/bakery-invoice-api/data
sudo mkdir -p /var/log/bakery-invoice-api

# Copy files
sudo cp -r * /opt/bakery-invoice-api/
sudo chown -R bakery:bakery /opt/bakery-invoice-api
sudo chown -R bakery:bakery /var/lib/bakery-invoice-api
sudo chown -R bakery:bakery /var/log/bakery-invoice-api

# Install systemd service
sudo cp bakery-invoice-api.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable bakery-invoice-api
sudo systemctl start bakery-invoice-api

echo "Deployment completed!"
echo "Service status: sudo systemctl status bakery-invoice-api"
echo "Logs: sudo journalctl -u bakery-invoice-api -f"
EOF
        
        chmod +x ${DEPLOY_DIR}/deploy.sh
        
        # Create archive
        tar -czf ${DEPLOY_DIR}.tar.gz ${DEPLOY_DIR}
        rm -rf ${DEPLOY_DIR}
        
        echo -e "${GREEN}✅ Server deployment package created: ${DEPLOY_DIR}.tar.gz${NC}"
        echo -e "${YELLOW}Upload and extract on target server, then run: ./deploy.sh${NC}"
        ;;
esac

# Post-deployment verification
echo -e "${YELLOW}Running post-deployment verification...${NC}"

case $DEPLOYMENT_TYPE in
    docker)
        # Wait for service to be ready
        sleep 10
        
        # Check health endpoint
        if curl -f http://localhost:8081/health &> /dev/null; then
            echo -e "${GREEN}✅ Health check passed${NC}"
        else
            echo -e "${RED}❌ Health check failed${NC}"
            exit 1
        fi
        ;;
        
    lambda)
        echo -e "${YELLOW}Lambda deployment verification requires manual testing${NC}"
        echo -e "${YELLOW}Check AWS Console for function status${NC}"
        ;;
        
    server)
        echo -e "${YELLOW}Server deployment verification requires manual testing${NC}"
        echo -e "${YELLOW}Deploy the package and check service status${NC}"
        ;;
esac

# Deployment summary
echo ""
echo -e "${GREEN}🎉 Deployment completed successfully!${NC}"
echo ""
echo -e "${BLUE}Deployment Summary:${NC}"
echo -e "  Environment: ${YELLOW}${ENVIRONMENT}${NC}"
echo -e "  Type: ${YELLOW}${DEPLOYMENT_TYPE}${NC}"
echo -e "  Timestamp: ${YELLOW}$(date)${NC}"
echo ""

case $DEPLOYMENT_TYPE in
    docker)
        echo -e "${BLUE}Access Information:${NC}"
        echo -e "  API URL: ${YELLOW}http://localhost:8081${NC}"
        echo -e "  Health Check: ${YELLOW}http://localhost:8081/health${NC}"
        echo -e "  API Docs: ${YELLOW}http://localhost:8081/swagger/index.html${NC}"
        ;;
    lambda)
        echo -e "${BLUE}Next Steps:${NC}"
        echo -e "  1. Check AWS Console for API Gateway URL"
        echo -e "  2. Test endpoints using the provided URL"
        echo -e "  3. Monitor CloudWatch logs for any issues"
        ;;
    server)
        echo -e "${BLUE}Next Steps:${NC}"
        echo -e "  1. Upload ${YELLOW}${DEPLOY_DIR}.tar.gz${NC} to target server"
        echo -e "  2. Extract and run ${YELLOW}./deploy.sh${NC}"
        echo -e "  3. Configure environment variables in ${YELLOW}/opt/bakery-invoice-api/.env${NC}"
        ;;
esac

echo ""