#!/bin/bash

# Automated Setup Script for Invoice Generator
# This script sets up the development environment automatically

echo "🚀 Invoice Generator Setup Script"
echo "================================="

# Check if we're in the right directory
if [ ! -f "package.json" ]; then
    echo "❌ Error: package.json not found. Please run this script from the project root."
    exit 1
fi

echo "📋 Setting up development environment..."

# Step 1: Install dependencies
echo ""
echo "📦 Installing dependencies..."
if command -v npm &> /dev/null; then
    npm install
    if [ $? -eq 0 ]; then
        echo "✅ Dependencies installed successfully"
    else
        echo "❌ Failed to install dependencies"
        exit 1
    fi
else
    echo "❌ npm not found. Please install Node.js and npm first."
    exit 1
fi

# Step 2: Create environment files
echo ""
echo "🌍 Setting up environment files..."

# Create .env.dev if it doesn't exist
if [ ! -f ".env.dev" ]; then
    cp .env.example .env.dev
    echo "✅ Created .env.dev from template"
else
    echo "ℹ️  .env.dev already exists"
fi

# Create .env.prod if it doesn't exist
if [ ! -f ".env.prod" ]; then
    cp .env.example .env.prod
    # Update production defaults
    sed -i '' 's/PORT=9002/PORT=3000/' .env.prod
    sed -i '' 's/NODE_ENV=development/NODE_ENV=production/' .env.prod
    echo "✅ Created .env.prod with production defaults"
else
    echo "ℹ️  .env.prod already exists"
fi

# Step 3: Make scripts executable
echo ""
echo "🔧 Setting up scripts..."
chmod +x dev.sh start.sh validate-config.sh
echo "✅ Made startup scripts executable"

# Step 4: Create required directories
echo ""
echo "📁 Creating required directories..."
mkdir -p src/lib/data/receipt-pdfs
echo "✅ Created PDF storage directory"

# Step 5: Validate configuration
echo ""
echo "🔍 Validating configuration..."
./validate-config.sh

# Step 6: Setup complete
echo ""
echo "🎉 Setup complete!"
echo ""
echo "🚀 Quick start commands:"
echo "   Development: ./dev.sh"
echo "   Production:  ./start.sh"
echo "   Docker:      docker-compose up --build"
echo "   Validate:    ./validate-config.sh"
echo ""
echo "📖 For more information, see README.md"
