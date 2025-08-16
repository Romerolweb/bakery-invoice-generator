#!/bin/bash

# Bakery Invoice API Build Script
# Supports building for both traditional server and serverless deployment

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Default values
BUILD_TYPE="all"
OUTPUT_DIR="bin"
GO_VERSION="1.24.6"

# Parse command line arguments
while [[ $# -gt 0 ]]; do
    case $1 in
        -t|--type)
            BUILD_TYPE="$2"
            shift 2
            ;;
        -o|--output)
            OUTPUT_DIR="$2"
            shift 2
            ;;
        -h|--help)
            echo "Usage: $0 [OPTIONS]"
            echo ""
            echo "Options:"
            echo "  -t, --type TYPE     Build type (server, lambda, all)"
            echo "  -o, --output DIR    Output directory (default: bin)"
            echo "  -h, --help          Show this help message"
            echo ""
            echo "Build Types:"
            echo "  server              Build traditional server binary"
            echo "  lambda              Build Lambda function binaries"
            echo "  all                 Build both server and Lambda binaries"
            echo ""
            echo "Examples:"
            echo "  $0 -t server        Build only the server binary"
            echo "  $0 -t lambda        Build only Lambda functions"
            echo "  $0 -t all           Build everything (default)"
            exit 0
            ;;
        *)
            echo -e "${RED}Unknown option: $1${NC}"
            exit 1
            ;;
    esac
done

echo -e "${BLUE}🏗️  Bakery Invoice API Build${NC}"
echo "================================"
echo -e "${YELLOW}Build Type: ${BUILD_TYPE}${NC}"
echo -e "${YELLOW}Output Directory: ${OUTPUT_DIR}${NC}"
echo -e "${YELLOW}Go Version: ${GO_VERSION}${NC}"
echo ""

# Check Go installation
echo -e "${YELLOW}Checking Go installation...${NC}"
if ! command -v go &> /dev/null; then
    echo -e "${RED}❌ Go is not installed${NC}"
    exit 1
fi

CURRENT_GO_VERSION=$(go version | awk '{print $3}' | sed 's/go//')
echo -e "${GREEN}✅ Go ${CURRENT_GO_VERSION} is installed${NC}"

# Create output directory
mkdir -p ${OUTPUT_DIR}

# Build server binary
build_server() {
    echo -e "${YELLOW}Building server binary...${NC}"
    
    CGO_ENABLED=1 GOOS=linux GOARCH=amd64 go build \
        -ldflags="-s -w -X main.version=$(git describe --tags --always --dirty 2>/dev/null || echo 'dev') -X main.buildTime=$(date -u +%Y-%m-%dT%H:%M:%SZ)" \
        -o ${OUTPUT_DIR}/bakery-invoice-api \
        cmd/server/main.go
    
    echo -e "${GREEN}✅ Server binary built: ${OUTPUT_DIR}/bakery-invoice-api${NC}"
}

# Build Lambda functions
build_lambda() {
    echo -e "${YELLOW}Building Lambda functions...${NC}"
    
    # Lambda functions to build
    FUNCTIONS=("customers" "products" "receipts" "email")
    
    for func in "${FUNCTIONS[@]}"; do
        echo -e "${YELLOW}Building ${func} Lambda function...${NC}"
        
        # Build the binary
        CGO_ENABLED=0 GOOS=linux GOARCH=amd64 go build \
            -ldflags="-s -w -X main.version=$(git describe --tags --always --dirty 2>/dev/null || echo 'dev') -X main.buildTime=$(date -u +%Y-%m-%dT%H:%M:%SZ)" \
            -o ${OUTPUT_DIR}/${func} \
            cmd/lambda/${func}/main.go
        
        # Create deployment package
        cd ${OUTPUT_DIR}
        zip -q ${func}.zip ${func}
        rm ${func}  # Remove the binary, keep only the zip
        cd ..
        
        echo -e "${GREEN}✅ ${func} Lambda function built: ${OUTPUT_DIR}/${func}.zip${NC}"
    done
}

# Build based on type
case $BUILD_TYPE in
    server)
        build_server
        ;;
    lambda)
        build_lambda
        ;;
    all)
        build_server
        build_lambda
        ;;
    *)
        echo -e "${RED}❌ Invalid build type: ${BUILD_TYPE}${NC}"
        echo -e "${YELLOW}Valid types: server, lambda, all${NC}"
        exit 1
        ;;
esac

# Build summary
echo ""
echo -e "${GREEN}🎉 Build completed successfully!${NC}"
echo ""
echo -e "${BLUE}Build Summary:${NC}"
echo -e "  Build Type: ${YELLOW}${BUILD_TYPE}${NC}"
echo -e "  Output Directory: ${YELLOW}${OUTPUT_DIR}${NC}"
echo -e "  Timestamp: ${YELLOW}$(date)${NC}"
echo ""

# List built artifacts
echo -e "${BLUE}Built Artifacts:${NC}"
ls -la ${OUTPUT_DIR}/

echo ""
echo -e "${BLUE}Next Steps:${NC}"
case $BUILD_TYPE in
    server)
        echo -e "  1. Run the server: ${YELLOW}./${OUTPUT_DIR}/bakery-invoice-api${NC}"
        echo -e "  2. Or use Docker: ${YELLOW}make docker-run${NC}"
        ;;
    lambda)
        echo -e "  1. Deploy to AWS: ${YELLOW}make deploy-lambda${NC}"
        echo -e "  2. Or test locally: ${YELLOW}serverless offline${NC}"
        ;;
    all)
        echo -e "  Server deployment:"
        echo -e "    - Run locally: ${YELLOW}./${OUTPUT_DIR}/bakery-invoice-api${NC}"
        echo -e "    - Use Docker: ${YELLOW}make docker-run${NC}"
        echo -e "  Lambda deployment:"
        echo -e "    - Deploy to AWS: ${YELLOW}make deploy-lambda${NC}"
        echo -e "    - Test locally: ${YELLOW}serverless offline${NC}"
        ;;
esac

echo ""