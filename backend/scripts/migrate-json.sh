#!/bin/bash

# JSON to SQLite Migration Script
# This script handles the complete migration process from JSON files to SQLite database

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Default values
DB_PATH="./data/bakery.db"
JSON_PATH="../src/lib/data"
MIGRATIONS_PATH="./migrations"
VERBOSE=false
DRY_RUN=false
FORCE_BACKUP=false
SKIP_VALIDATION=false

# Function to print colored output
print_status() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

print_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

print_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Function to show usage
show_usage() {
    echo "Usage: $0 [OPTIONS]"
    echo ""
    echo "Options:"
    echo "  -d, --db-path PATH          Database file path (default: ./data/bakery.db)"
    echo "  -j, --json-path PATH        JSON files directory path (default: ../src/lib/data)"
    echo "  -m, --migrations-path PATH  Migrations directory path (default: ./migrations)"
    echo "  -v, --verbose               Enable verbose logging"
    echo "  -n, --dry-run              Perform a dry run without making changes"
    echo "  -f, --force-backup         Force backup even if files already exist"
    echo "  -s, --skip-validation      Skip post-migration validation"
    echo "  -h, --help                 Show this help message"
    echo ""
    echo "Examples:"
    echo "  $0                         # Run with default settings"
    echo "  $0 --dry-run               # Check what would be migrated"
    echo "  $0 --verbose               # Run with detailed logging"
    echo "  $0 --db-path ./custom.db   # Use custom database path"
}

# Parse command line arguments
while [[ $# -gt 0 ]]; do
    case $1 in
        -d|--db-path)
            DB_PATH="$2"
            shift 2
            ;;
        -j|--json-path)
            JSON_PATH="$2"
            shift 2
            ;;
        -m|--migrations-path)
            MIGRATIONS_PATH="$2"
            shift 2
            ;;
        -v|--verbose)
            VERBOSE=true
            shift
            ;;
        -n|--dry-run)
            DRY_RUN=true
            shift
            ;;
        -f|--force-backup)
            FORCE_BACKUP=true
            shift
            ;;
        -s|--skip-validation)
            SKIP_VALIDATION=true
            shift
            ;;
        -h|--help)
            show_usage
            exit 0
            ;;
        *)
            print_error "Unknown option: $1"
            show_usage
            exit 1
            ;;
    esac
done

# Function to check prerequisites
check_prerequisites() {
    print_status "Checking prerequisites..."

    # Check if Go is installed
    if ! command -v go &> /dev/null; then
        print_error "Go is not installed. Please install Go 1.21 or later."
        exit 1
    fi

    # Check Go version
    GO_VERSION=$(go version | awk '{print $3}' | sed 's/go//')
    print_status "Found Go version: $GO_VERSION"

    # Check if we're in the backend directory
    if [[ ! -f "go.mod" ]]; then
        print_error "This script must be run from the backend directory"
        exit 1
    fi

    # Check if migrations directory exists
    if [[ ! -d "$MIGRATIONS_PATH" ]]; then
        print_error "Migrations directory not found: $MIGRATIONS_PATH"
        exit 1
    fi

    # Check if JSON directory exists
    if [[ ! -d "$JSON_PATH" ]]; then
        print_error "JSON directory not found: $JSON_PATH"
        exit 1
    fi

    print_success "Prerequisites check passed"
}

# Function to check JSON files
check_json_files() {
    print_status "Checking for JSON files..."

    local verbose_flag=""
    if [[ "$VERBOSE" == true ]]; then
        verbose_flag="-verbose"
    fi

    if ! go run cmd/json-migrate/main.go -action=check -json="$JSON_PATH" $verbose_flag; then
        print_error "Failed to check JSON files"
        exit 1
    fi
}

# Function to run database migrations
run_db_migrations() {
    print_status "Running database migrations..."

    local verbose_flag=""
    if [[ "$VERBOSE" == true ]]; then
        verbose_flag="-verbose"
    fi

    if ! go run cmd/migrate/main.go -action=up -db="$DB_PATH" -migrations="$MIGRATIONS_PATH" $verbose_flag; then
        print_error "Database migration failed"
        exit 1
    fi

    print_success "Database migrations completed"
}

# Function to run JSON migration
run_json_migration() {
    print_status "Running JSON to SQLite migration..."

    local verbose_flag=""
    local dry_run_flag=""
    local force_backup_flag=""

    if [[ "$VERBOSE" == true ]]; then
        verbose_flag="-verbose"
    fi

    if [[ "$DRY_RUN" == true ]]; then
        dry_run_flag="-dry-run"
        print_warning "This is a dry run - no changes will be made"
    fi

    if [[ "$FORCE_BACKUP" == true ]]; then
        force_backup_flag="-force-backup"
    fi

    if ! go run cmd/json-migrate/main.go -action=migrate -db="$DB_PATH" -json="$JSON_PATH" $verbose_flag $dry_run_flag $force_backup_flag; then
        print_error "JSON migration failed"
        exit 1
    fi

    if [[ "$DRY_RUN" == true ]]; then
        print_success "Dry run completed successfully"
        return
    fi

    print_success "JSON migration completed"
}

# Function to validate migration
validate_migration() {
    if [[ "$SKIP_VALIDATION" == true ]] || [[ "$DRY_RUN" == true ]]; then
        return
    fi

    print_status "Validating migration results..."

    local verbose_flag=""
    if [[ "$VERBOSE" == true ]]; then
        verbose_flag="-verbose"
    fi

    if ! go run cmd/json-migrate/main.go -action=validate -db="$DB_PATH" -json="$JSON_PATH" $verbose_flag; then
        print_warning "Migration validation failed, but migration may still be successful"
        print_warning "Please check the database manually"
        return
    fi

    print_success "Migration validation passed"
}

# Function to show summary
show_summary() {
    echo ""
    echo "=== Migration Summary ==="
    echo "Database path: $DB_PATH"
    echo "JSON path: $JSON_PATH"
    echo "Migrations path: $MIGRATIONS_PATH"
    echo "Dry run: $DRY_RUN"
    echo "Verbose: $VERBOSE"
    echo ""

    if [[ "$DRY_RUN" == false ]]; then
        print_success "Migration completed successfully!"
        echo ""
        echo "Next steps:"
        echo "1. Test your application with the new database"
        echo "2. Update your application configuration to use SQLite"
        echo "3. Consider backing up the original JSON files"
        echo ""
        echo "Database file: $DB_PATH"
        echo "JSON backup location: $JSON_PATH/backup/"
    else
        print_success "Dry run completed successfully!"
        echo ""
        echo "To perform the actual migration, run:"
        echo "$0 $(echo "$@" | sed 's/--dry-run//g' | sed 's/-n//g')"
    fi
}

# Function to handle cleanup on error
cleanup_on_error() {
    print_error "Migration failed. Cleaning up..."
    
    # If database was created during this run, we could remove it
    # But we'll leave it for debugging purposes
    
    print_error "Migration aborted. Check the logs above for details."
    exit 1
}

# Set up error handling
trap cleanup_on_error ERR

# Main execution
main() {
    echo "=== Bakery Invoice System - JSON to SQLite Migration ==="
    echo ""

    check_prerequisites
    check_json_files
    
    if [[ "$DRY_RUN" == false ]]; then
        run_db_migrations
    fi
    
    run_json_migration
    validate_migration
    show_summary
}

# Run main function
main "$@"