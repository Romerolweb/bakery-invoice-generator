#!/bin/bash

# Bakery Invoice API Deployment Validation Script
# Validates that both server and serverless deployments work correctly

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Default values
DEPLOYMENT_MODE="both"
SERVER_URL="http://localhost:8081"
LAMBDA_URL=""

# Parse command line arguments
while [[ $# -gt 0 ]]; do
    case $1 in
        -m|--mode)
            DEPLOYMENT_MODE="$2"
            shift 2
            ;;
        -s|--server-url)
            SERVER_URL="$2"
            shift 2
            ;;
        -l|--lambda-url)
            LAMBDA_URL="$2"
            shift 2
            ;;
        -h|--help)
            echo "Usage: $0 [OPTIONS]"
            echo ""
            echo "Options:"
            echo "  -m, --mode MODE         Validation mode (server, lambda, both)"
            echo "  -s, --server-url URL    Server URL (default: http://localhost:8081)"
            echo "  -l, --lambda-url URL    Lambda API Gateway URL"
            echo "  -h, --help              Show this help message"
            echo ""
            echo "Examples:"
            echo "  $0 -m server            Validate only server deployment"
            echo "  $0 -m lambda -l https://api.gateway.url  Validate Lambda deployment"
            echo "  $0 -m both -l https://api.gateway.url    Validate both deployments"
            exit 0
            ;;
        *)
            echo -e "${RED}Unknown option: $1${NC}"
            exit 1
            ;;
    esac
done

echo -e "${BLUE}🔍 Bakery Invoice API Deployment Validation${NC}"
echo "=============================================="
echo -e "${YELLOW}Validation Mode: ${DEPLOYMENT_MODE}${NC}"
echo ""

# Validation functions
validate_endpoint() {
    local url=$1
    local endpoint=$2
    local description=$3
    
    echo -e "${YELLOW}Testing ${description}...${NC}"
    
    if curl -f -s "${url}${endpoint}" > /dev/null; then
        echo -e "${GREEN}✅ ${description} - OK${NC}"
        return 0
    else
        echo -e "${RED}❌ ${description} - FAILED${NC}"
        return 1
    fi
}

validate_api_endpoints() {
    local base_url=$1
    local deployment_type=$2
    
    echo -e "${BLUE}Validating ${deployment_type} API endpoints...${NC}"
    
    local failed=0
    
    # Health check
    validate_endpoint "$base_url" "/health" "Health Check" || ((failed++))
    
    # API documentation
    validate_endpoint "$base_url" "/swagger/index.html" "Swagger Documentation" || ((failed++))
    
    # API endpoints (these might return 401 without auth, but should not 404)
    echo -e "${YELLOW}Testing API endpoints (expecting 401 or 200)...${NC}"
    
    for endpoint in "/api/v1/customers" "/api/v1/products" "/api/v1/receipts"; do
        local status_code=$(curl -s -o /dev/null -w "%{http_code}" "${base_url}${endpoint}" || echo "000")
        
        if [[ "$status_code" == "200" || "$status_code" == "401" ]]; then
            echo -e "${GREEN}✅ ${endpoint} - OK (${status_code})${NC}"
        else
            echo -e "${RED}❌ ${endpoint} - FAILED (${status_code})${NC}"
            ((failed++))
        fi
    done
    
    return $failed
}

validate_server_deployment() {
    echo -e "${BLUE}🖥️  Validating Server Deployment${NC}"
    echo "================================="
    
    # Check if server is running
    if ! curl -f -s "${SERVER_URL}/health" > /dev/null; then
        echo -e "${RED}❌ Server is not running at ${SERVER_URL}${NC}"
        echo -e "${YELLOW}💡 Start the server with: make dev${NC}"
        return 1
    fi
    
    validate_api_endpoints "$SERVER_URL" "Server"
    local server_result=$?
    
    if [[ $server_result -eq 0 ]]; then
        echo -e "${GREEN}🎉 Server deployment validation passed!${NC}"
    else
        echo -e "${RED}❌ Server deployment validation failed with ${server_result} errors${NC}"
    fi
    
    return $server_result
}

validate_lambda_deployment() {
    echo -e "${BLUE}☁️  Validating Lambda Deployment${NC}"
    echo "================================="
    
    if [[ -z "$LAMBDA_URL" ]]; then
        echo -e "${RED}❌ Lambda URL not provided${NC}"
        echo -e "${YELLOW}💡 Use -l flag to specify Lambda API Gateway URL${NC}"
        return 1
    fi
    
    # Check if Lambda is accessible
    if ! curl -f -s "${LAMBDA_URL}/health" > /dev/null; then
        echo -e "${RED}❌ Lambda API is not accessible at ${LAMBDA_URL}${NC}"
        echo -e "${YELLOW}💡 Check your API Gateway URL and deployment status${NC}"
        return 1
    fi
    
    validate_api_endpoints "$LAMBDA_URL" "Lambda"
    local lambda_result=$?
    
    # Additional Lambda-specific validations
    echo -e "${BLUE}Testing Lambda-specific features...${NC}"
    
    # Test cold start performance
    echo -e "${YELLOW}Testing cold start performance...${NC}"
    local start_time=$(date +%s%N)
    curl -f -s "${LAMBDA_URL}/health" > /dev/null
    local end_time=$(date +%s%N)
    local duration=$(( (end_time - start_time) / 1000000 ))
    
    if [[ $duration -lt 5000 ]]; then
        echo -e "${GREEN}✅ Cold start performance - OK (${duration}ms)${NC}"
    else
        echo -e "${YELLOW}⚠️  Cold start performance - SLOW (${duration}ms)${NC}"
    fi
    
    if [[ $lambda_result -eq 0 ]]; then
        echo -e "${GREEN}🎉 Lambda deployment validation passed!${NC}"
    else
        echo -e "${RED}❌ Lambda deployment validation failed with ${lambda_result} errors${NC}"
    fi
    
    return $lambda_result
}

# Run validations based on mode
case $DEPLOYMENT_MODE in
    server)
        validate_server_deployment
        exit $?
        ;;
    lambda)
        validate_lambda_deployment
        exit $?
        ;;
    both)
        echo -e "${BLUE}Validating both deployment modes...${NC}"
        echo ""
        
        validate_server_deployment
        server_result=$?
        
        echo ""
        
        validate_lambda_deployment
        lambda_result=$?
        
        echo ""
        echo -e "${BLUE}📊 Validation Summary${NC}"
        echo "===================="
        
        if [[ $server_result -eq 0 ]]; then
            echo -e "${GREEN}✅ Server deployment - PASSED${NC}"
        else
            echo -e "${RED}❌ Server deployment - FAILED${NC}"
        fi
        
        if [[ $lambda_result -eq 0 ]]; then
            echo -e "${GREEN}✅ Lambda deployment - PASSED${NC}"
        else
            echo -e "${RED}❌ Lambda deployment - FAILED${NC}"
        fi
        
        total_errors=$((server_result + lambda_result))
        
        if [[ $total_errors -eq 0 ]]; then
            echo -e "${GREEN}🎉 All validations passed!${NC}"
        else
            echo -e "${RED}❌ ${total_errors} validation(s) failed${NC}"
        fi
        
        exit $total_errors
        ;;
    *)
        echo -e "${RED}❌ Invalid validation mode: ${DEPLOYMENT_MODE}${NC}"
        echo -e "${YELLOW}Valid modes: server, lambda, both${NC}"
        exit 1
        ;;
esac