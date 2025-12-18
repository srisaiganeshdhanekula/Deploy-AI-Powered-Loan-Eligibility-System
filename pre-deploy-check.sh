#!/bin/bash

# Render Deployment Pre-Check Script
# This script helps verify your project is ready for Render deployment

echo "🔍 AI Loan System - Render Deployment Pre-Check"
echo "================================================"
echo ""

# Color codes
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Check counters
PASSED=0
FAILED=0
WARNINGS=0

# Function to check file exists
check_file() {
    if [ -f "$1" ]; then
        echo -e "${GREEN}✓${NC} $2"
        ((PASSED++))
        return 0
    else
        echo -e "${RED}✗${NC} $2"
        ((FAILED++))
        return 1
    fi
}

# Function to check directory exists
check_dir() {
    if [ -d "$1" ]; then
        echo -e "${GREEN}✓${NC} $2"
        ((PASSED++))
        return 0
    else
        echo -e "${RED}✗${NC} $2"
        ((FAILED++))
        return 1
    fi
}

# Function to check if string exists in file
check_content() {
    if grep -q "$2" "$1" 2>/dev/null; then
        echo -e "${GREEN}✓${NC} $3"
        ((PASSED++))
        return 0
    else
        echo -e "${YELLOW}⚠${NC} $3"
        ((WARNINGS++))
        return 1
    fi
}

echo "📁 Checking Project Structure..."
echo "================================"
check_file "render.yaml" "render.yaml exists in root"
check_file "backend/requirements.txt" "Backend requirements.txt exists"
check_file "backend/main.py" "Backend main.py exists"
check_file "frontend/package.json" "Frontend package.json exists"
check_dir "backend/app" "Backend app directory exists"
check_dir "frontend/src" "Frontend src directory exists"
echo ""

echo "🔧 Checking Backend Configuration..."
echo "====================================="
check_file "backend/.env.example" ".env.example exists (reference)"
check_content "backend/requirements.txt" "fastapi" "FastAPI in requirements.txt"
check_content "backend/requirements.txt" "sqlalchemy" "SQLAlchemy in requirements.txt"
check_content "backend/requirements.txt" "python-jose" "python-jose in requirements.txt"
check_content "backend/requirements.txt" "passlib" "passlib in requirements.txt"
echo ""

echo "🌐 Checking Frontend Configuration..."
echo "======================================"
check_file "frontend/.env.example" ".env.example exists (reference)"
check_content "frontend/package.json" "react" "React in package.json"
check_content "frontend/package.json" "react-scripts" "react-scripts in package.json"
echo ""

echo "📋 Checking render.yaml Configuration..."
echo "=========================================="
check_content "render.yaml" "ai-loan-backend" "Backend service defined"
check_content "render.yaml" "ai-loan-frontend" "Frontend service defined"
check_content "render.yaml" "ai-loan-db" "Database defined"
check_content "render.yaml" "GEMINI_API_KEY" "GEMINI_API_KEY in render.yaml"
check_content "render.yaml" "SMTP_EMAIL" "SMTP_EMAIL in render.yaml"
check_content "render.yaml" "SECRET_KEY" "SECRET_KEY in render.yaml"
echo ""

echo "🔑 Checking Environment Variable Documentation..."
echo "=================================================="
check_file "DEPLOYMENT_GUIDE.md" "Deployment guide exists"
check_file "ENV_VARIABLES.md" "Environment variables reference exists"
echo ""

echo "📊 Pre-Check Summary"
echo "===================="
echo -e "${GREEN}Passed:${NC} $PASSED"
echo -e "${YELLOW}Warnings:${NC} $WARNINGS"
echo -e "${RED}Failed:${NC} $FAILED"
echo ""

if [ $FAILED -eq 0 ]; then
    echo -e "${GREEN}✓ Project structure looks good!${NC}"
    echo ""
    echo "📝 Next Steps:"
    echo "1. Review DEPLOYMENT_GUIDE.md for detailed instructions"
    echo "2. Review ENV_VARIABLES.md for all required keys"
    echo "3. Get your API keys:"
    echo "   - Gemini API: https://makersuite.google.com/app/apikey"
    echo "   - Gmail App Password: https://myaccount.google.com/apppasswords"
    echo "4. Push code to GitHub"
    echo "5. Deploy on Render using Blueprint (render.yaml)"
    echo ""
else
    echo -e "${RED}✗ Some required files are missing!${NC}"
    echo "Please fix the failed checks before deploying."
    echo ""
fi

if [ $WARNINGS -gt 0 ]; then
    echo -e "${YELLOW}⚠ Some optional features may not be available${NC}"
    echo "Review the warnings above if you need those features."
    echo ""
fi

echo "🚀 Ready to deploy? Follow the deployment guide!"
echo ""
