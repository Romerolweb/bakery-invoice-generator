#!/bin/bash

# Pre-commit setup script for Bakery Invoice Generator
# This script installs and configures pre-commit hooks

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${BLUE}🔧 Setting up pre-commit hooks for Bakery Invoice Generator${NC}"
echo "================================================================"

# Check if pre-commit is installed
if ! command -v pre-commit &> /dev/null; then
    echo -e "${YELLOW}⚠️  pre-commit is not installed. Installing...${NC}"
    
    # Try to install with pip
    if command -v pip &> /dev/null; then
        pip install pre-commit
    elif command -v pip3 &> /dev/null; then
        pip3 install pre-commit
    elif command -v brew &> /dev/null; then
        brew install pre-commit
    else
        echo -e "${RED}❌ Could not install pre-commit. Please install it manually:${NC}"
        echo -e "${YELLOW}   pip install pre-commit${NC}"
        echo -e "${YELLOW}   or visit: https://pre-commit.com/#installation${NC}"
        exit 1
    fi
fi

echo -e "${GREEN}✅ pre-commit is installed${NC}"

# Check if we're in a git repository
if [ ! -d ".git" ]; then
    echo -e "${RED}❌ Not in a git repository. Please run this script from the project root.${NC}"
    exit 1
fi

# Install the git hook scripts
echo -e "${YELLOW}📦 Installing pre-commit hooks...${NC}"
pre-commit install

# Install commit-msg hook for conventional commits (optional)
echo -e "${YELLOW}📝 Installing commit-msg hook...${NC}"
pre-commit install --hook-type commit-msg

# Check if Node.js dependencies are installed
if [ ! -d "node_modules" ]; then
    echo -e "${YELLOW}⚠️  Node.js dependencies not found. Installing...${NC}"
    npm install
fi

# Check if Go dependencies are available
echo -e "${YELLOW}🐹 Checking Go dependencies...${NC}"
cd backend
if [ ! -f "go.mod" ]; then
    echo -e "${RED}❌ go.mod not found in backend directory${NC}"
    exit 1
fi

# Download Go dependencies
go mod download
go mod tidy

# Install Go tools if not present
echo -e "${YELLOW}🔧 Installing Go tools...${NC}"

# Install goimports
if ! command -v goimports &> /dev/null; then
    echo "Installing goimports..."
    go install golang.org/x/tools/cmd/goimports@latest
fi

# Install golangci-lint
if ! command -v golangci-lint &> /dev/null; then
    echo "Installing golangci-lint..."
    go install github.com/golangci/golangci-lint/cmd/golangci-lint@latest
fi

cd ..

# Run pre-commit on all files to test the setup
echo -e "${YELLOW}🧪 Testing pre-commit setup on all files...${NC}"
if pre-commit run --all-files; then
    echo -e "${GREEN}✅ All pre-commit hooks passed!${NC}"
else
    echo -e "${YELLOW}⚠️  Some hooks failed, but that's normal for the first run.${NC}"
    echo -e "${YELLOW}   The hooks have been installed and will run on future commits.${NC}"
fi

# Create a sample commit message template
echo -e "${YELLOW}📝 Creating commit message template...${NC}"
cat > .gitmessage << 'EOF'
# <type>(<scope>): <subject>
#
# <body>
#
# <footer>

# Type should be one of the following:
# * feat: A new feature
# * fix: A bug fix
# * docs: Documentation only changes
# * style: Changes that do not affect the meaning of the code
# * refactor: A code change that neither fixes a bug nor adds a feature
# * perf: A code change that improves performance
# * test: Adding missing tests or correcting existing tests
# * build: Changes that affect the build system or external dependencies
# * ci: Changes to our CI configuration files and scripts
# * chore: Other changes that don't modify src or test files
# * revert: Reverts a previous commit

# Scope is optional and should be the name of the package affected
# Subject should be imperative, lowercase and no period
# Body should include motivation for the change and contrast with previous behavior
# Footer should contain any information about Breaking Changes and reference GitHub issues
EOF

# Configure git to use the commit template
git config commit.template .gitmessage

echo ""
echo -e "${GREEN}🎉 Pre-commit setup completed successfully!${NC}"
echo ""
echo -e "${BLUE}📋 Summary:${NC}"
echo -e "  ✅ Pre-commit hooks installed"
echo -e "  ✅ Go tools installed (goimports, golangci-lint)"
echo -e "  ✅ Node.js dependencies checked"
echo -e "  ✅ Commit message template created"
echo ""
echo -e "${BLUE}📝 Usage:${NC}"
echo -e "  • Hooks will run automatically on ${YELLOW}git commit${NC}"
echo -e "  • Run manually: ${YELLOW}pre-commit run --all-files${NC}"
echo -e "  • Update hooks: ${YELLOW}pre-commit autoupdate${NC}"
echo -e "  • Skip hooks: ${YELLOW}git commit --no-verify${NC} (not recommended)"
echo ""
echo -e "${BLUE}🔧 Configuration:${NC}"
echo -e "  • Config file: ${YELLOW}.pre-commit-config.yaml${NC}"
echo -e "  • Commit template: ${YELLOW}.gitmessage${NC}"
echo ""
echo -e "${GREEN}Happy coding! 🚀${NC}"