#!/bin/bash

# AWS Lambda Deployment Script for Bakery Invoice API
# This script handles deployment to different AWS environments

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Default values
STAGE="dev"
REGION="us-east-1"
VERBOSE=false
DRY_RUN=false
FORCE=false

# Script directory
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"

# Parse command line arguments
while [[ $# -gt 0 ]]; do
    case $1 in
        -s|--stage)
            STAGE="$2"
            shift 2
            ;;
        -r|--region)
            REGION="$2"
            shift 2
            ;;
        -v|--verbose)
            VERBOSE=true
            shift
            ;;
        -d|--dry-run)
            DRY_RUN=true
            shift
            ;;
        -f|--force)
            FORCE=true
            shift
            ;;
        -h|--help)
            echo "Usage: $0 [OPTIONS]"
            echo ""
            echo "Options:"
            echo "  -s, --stage STAGE       Deployment stage (dev, staging, prod)"
            echo "  -r, --region REGION     AWS region (default: us-east-1)"
            echo "  -v, --verbose           Enable verbose output"
            echo "  -d, --dry-run           Perform a dry run without actual deployment"
            echo "  -f, --force             Force deployment without confirmation"
            echo "  -h, --help              Show this help message"
            echo ""
            echo "Examples:"
            echo "  $0 -s dev               Deploy to development"
            echo "  $0 -s prod -r us-west-2 Deploy to production in us-west-2"
            echo "  $0 -s staging -d        Dry run deployment to staging"
            exit 0
            ;;
        *)
            echo -e "${RED}Unknown option: $1${NC}"
            exit 1
            ;;
    esac
done

echo -e "${BLUE}🚀 AWS Lambda Deployment${NC}"
echo "=========================="
echo -e "${YELLOW}Stage: ${STAGE}${NC}"
echo -e "${YELLOW}Region: ${REGION}${NC}"
echo -e "${YELLOW}Dry Run: ${DRY_RUN}${NC}"
echo ""

# Validate stage
case $STAGE in
    dev|staging|prod)
        ;;
    *)
        echo -e "${RED}❌ Invalid stage: ${STAGE}${NC}"
        echo -e "${YELLOW}Valid stages: dev, staging, prod${NC}"
        exit 1
        ;;
esac

# Check prerequisites
echo -e "${YELLOW}Checking prerequisites...${NC}"

# Check if we're in the right directory
if [ ! -f "${PROJECT_ROOT}/go.mod" ]; then
    echo -e "${RED}❌ Not in project root directory${NC}"
    exit 1
fi

# Check Go installation
if ! command -v go &> /dev/null; then
    echo -e "${RED}❌ Go is not installed${NC}"
    exit 1
fi
echo -e "${GREEN}✅ Go is installed$(NC)"

# Check AWS CLI
if ! command -v aws &> /dev/null; then
    echo -e "${RED}❌ AWS CLI is not installed${NC}"
    exit 1
fi
echo -e "${GREEN}✅ AWS CLI is installed$(NC)"

# Check AWS credentials
if ! aws sts get-caller-identity &> /dev/null; then
    echo -e "${RED}❌ AWS credentials not configured${NC}"
    echo -e "${YELLOW}Configure with: aws configure${NC}"
    exit 1
fi
echo -e "${GREEN}✅ AWS credentials configured$(NC)"

# Check Serverless Framework
if ! command -v serverless &> /dev/null; then
    echo -e "${RED}❌ Serverless Framework is not installed${NC}"
    echo -e "${YELLOW}Install with: npm install -g serverless${NC}"
    exit 1
fi
echo -e "${GREEN}✅ Serverless Framework is installed$(NC)"

# Check if serverless config exists
SERVERLESS_CONFIG="serverless.${STAGE}.yml"
if [ ! -f "${SCRIPT_DIR}/${SERVERLESS_CONFIG}" ]; then
    echo -e "${YELLOW}⚠ Stage-specific config not found, using base config${NC}"
    SERVERLESS_CONFIG="serverless.yml"
fi

if [ ! -f "${SCRIPT_DIR}/${SERVERLESS_CONFIG}" ]; then
    echo -e "${RED}❌ Serverless configuration not found: ${SERVERLESS_CONFIG}${NC}"
    exit 1
fi
echo -e "${GREEN}✅ Serverless configuration found: ${SERVERLESS_CONFIG}${NC}"

# Load environment variables if .env file exists
ENV_FILE="${PROJECT_ROOT}/.env.${STAGE}"
if [ -f "${ENV_FILE}" ]; then
    echo -e "${YELLOW}Loading environment variables from ${ENV_FILE}...${NC}"
    set -a
    source "${ENV_FILE}"
    set +a
    echo -e "${GREEN}✅ Environment variables loaded${NC}"
else
    echo -e "${YELLOW}⚠ No environment file found: ${ENV_FILE}${NC}"
fi

# Validate required environment variables for production
if [ "$STAGE" = "prod" ]; then
    echo -e "${YELLOW}Validating production environment variables...${NC}"
    
    REQUIRED_VARS=("DB_CONNECTION_STRING" "S3_BUCKET" "SMTP_HOST" "JWT_SECRET")
    MISSING_VARS=()
    
    for var in "${REQUIRED_VARS[@]}"; do
        if [ -z "${!var}" ]; then
            MISSING_VARS+=("$var")
        fi
    done
    
    if [ ${#MISSING_VARS[@]} -ne 0 ]; then
        echo -e "${RED}❌ Missing required environment variables for production:${NC}"
        for var in "${MISSING_VARS[@]}"; do
            echo -e "${RED}  - $var${NC}"
        done
        exit 1
    fi
    echo -e "${GREEN}✅ All required environment variables present${NC}"
fi

# Build Lambda functions
echo -e "${YELLOW}Building Lambda functions...${NC}"
cd "${PROJECT_ROOT}"

if [ "$VERBOSE" = true ]; then
    make lambda-build
else
    make lambda-build > /dev/null 2>&1
fi

if [ $? -ne 0 ]; then
    echo -e "${RED}❌ Build failed${NC}"
    exit 1
fi
echo -e "${GREEN}✅ Lambda functions built successfully${NC}"

# Check if binaries exist
FUNCTIONS=("customers" "products" "receipts" "email")
for func in "${FUNCTIONS[@]}"; do
    if [ ! -f "${PROJECT_ROOT}/bin/${func}.zip" ]; then
        echo -e "${RED}❌ Missing binary: bin/${func}.zip${NC}"
        exit 1
    fi
done
echo -e "${GREEN}✅ All function binaries present${NC}"

# Run tests
echo -e "${YELLOW}Running tests...${NC}"
cd "${PROJECT_ROOT}"

if [ "$VERBOSE" = true ]; then
    make test
else
    make test > /dev/null 2>&1
fi

if [ $? -ne 0 ]; then
    echo -e "${RED}❌ Tests failed${NC}"
    exit 1
fi
echo -e "${GREEN}✅ Tests passed${NC}"

# Deployment confirmation
if [ "$FORCE" = false ] && [ "$DRY_RUN" = false ]; then
    echo ""
    echo -e "${YELLOW}⚠ You are about to deploy to ${STAGE} environment${NC}"
    echo -e "${YELLOW}Region: ${REGION}${NC}"
    echo -e "${YELLOW}Config: ${SERVERLESS_CONFIG}${NC}"
    echo ""
    read -p "Do you want to continue? (y/N): " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        echo -e "${YELLOW}Deployment cancelled${NC}"
        exit 0
    fi
fi

# Deploy with Serverless Framework
echo -e "${YELLOW}Deploying to AWS Lambda...${NC}"
cd "${SCRIPT_DIR}"

# Prepare serverless command
SERVERLESS_CMD="serverless deploy --stage ${STAGE} --region ${REGION}"

if [ -f "${SERVERLESS_CONFIG}" ] && [ "${SERVERLESS_CONFIG}" != "serverless.yml" ]; then
    SERVERLESS_CMD="${SERVERLESS_CMD} --config ${SERVERLESS_CONFIG}"
fi

if [ "$VERBOSE" = true ]; then
    SERVERLESS_CMD="${SERVERLESS_CMD} --verbose"
fi

if [ "$DRY_RUN" = true ]; then
    echo -e "${YELLOW}Dry run mode - would execute:${NC}"
    echo -e "${BLUE}${SERVERLESS_CMD}${NC}"
    echo -e "${GREEN}✅ Dry run completed${NC}"
    exit 0
fi

# Execute deployment
echo -e "${BLUE}Executing: ${SERVERLESS_CMD}${NC}"
eval $SERVERLESS_CMD

if [ $? -ne 0 ]; then
    echo -e "${RED}❌ Deployment failed${NC}"
    exit 1
fi

echo -e "${GREEN}✅ Deployment completed successfully${NC}"

# Post-deployment validation
echo -e "${YELLOW}Running post-deployment validation...${NC}"

# Get API Gateway URL
API_URL=$(serverless info --stage ${STAGE} --region ${REGION} --verbose | grep -o 'https://[^[:space:]]*' | head -1)

if [ -n "$API_URL" ]; then
    echo -e "${GREEN}✅ API Gateway URL: ${API_URL}${NC}"
    
    # Test health endpoint
    echo -e "${YELLOW}Testing health endpoint...${NC}"
    if curl -f "${API_URL}/health" &> /dev/null; then
        echo -e "${GREEN}✅ Health check passed${NC}"
    else
        echo -e "${YELLOW}⚠ Health check failed (this might be expected for new deployments)${NC}"
    fi
else
    echo -e "${YELLOW}⚠ Could not determine API Gateway URL${NC}"
fi

# Display deployment summary
echo ""
echo -e "${GREEN}🎉 Deployment Summary${NC}"
echo "======================"
echo -e "${BLUE}Stage:${NC} ${STAGE}"
echo -e "${BLUE}Region:${NC} ${REGION}"
echo -e "${BLUE}Functions Deployed:${NC} ${#FUNCTIONS[@]}"
echo -e "${BLUE}Timestamp:${NC} $(date)"

if [ -n "$API_URL" ]; then
    echo -e "${BLUE}API URL:${NC} ${API_URL}"
fi

echo ""
echo -e "${BLUE}Next Steps:${NC}"
echo -e "1. Test the API endpoints using the URL above"
echo -e "2. Monitor CloudWatch logs for any issues"
echo -e "3. Set up monitoring and alerting if not already configured"

if [ "$STAGE" = "prod" ]; then
    echo -e "4. ${YELLOW}Update DNS records to point to the new API Gateway${NC}"
    echo -e "5. ${YELLOW}Notify stakeholders of the production deployment${NC}"
fi

echo ""
echo -e "${GREEN}Deployment completed successfully! 🚀${NC}"