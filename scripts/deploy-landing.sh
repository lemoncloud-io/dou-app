#!/bin/bash
set -euo pipefail

# Constants
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
APP_NAME="landing"

# Environment-specific buckets (NOT using subfolders)
DEV_BUCKET_NAME=""
PROD_BUCKET_NAME=""

# CloudFront Distribution IDs
DEV_DISTRIBUTION_ID=""
PROD_DISTRIBUTION_ID=""

DIST_DIR="${PROJECT_ROOT}/dist/apps/${APP_NAME}"
WELL_KNOWN_DIR="${DIST_DIR}/.well-known"
CACHE_CONTROL_NO_CACHE="max-age=0,no-cache,no-store,must-revalidate"
CACHE_CONTROL_WELL_KNOWN="max-age=3600,s-maxage=3600"
PKG_FILE="${PROJECT_ROOT}/apps/${APP_NAME}/package.json"

# Functions
log_error() {
    echo "[ERROR] $1" >&2
}

log_info() {
    echo "[INFO] $1"
}

log_success() {
    echo "[SUCCESS] $1"
}

log_warning() {
    echo "[WARNING] $1"
}

show_usage() {
    echo "Usage: $0 <environment>"
    echo ""
    echo "Arguments:"
    echo "  environment    Required deployment environment (dev or prod)"
    echo ""
    echo "Examples:"
    echo "  $0 dev         Deploy to development (app-dev.chatic.io)"
    echo "  $0 prod        Deploy to production (app.chatic.io)"
    echo ""
    echo "Buckets:"
    echo "  dev:  s3://${DEV_BUCKET_NAME}"
    echo "  prod: s3://${PROD_BUCKET_NAME}"
}

validate_arguments() {
    if [ $# -ne 1 ]; then
        log_error "Environment argument is required"
        show_usage
        exit 1
    fi

    local deploy_env="$1"
    if [[ "$deploy_env" != "dev" && "$deploy_env" != "prod" ]]; then
        log_error "Invalid environment: $deploy_env"
        log_error "Valid environments: dev, prod"
        exit 1
    fi
}

load_env_file() {
    local env_file="${SCRIPT_DIR}/.env.deploy"
    if [ -f "$env_file" ]; then
        log_info "Loading environment from ${env_file}"
        set -a
        source "$env_file"
        set +a
    fi
}

load_deploy_config() {
    DEV_BUCKET_NAME="${LANDING_S3_DEV_BUCKET:?'LANDING_S3_DEV_BUCKET environment variable is required'}"
    PROD_BUCKET_NAME="${LANDING_S3_PROD_BUCKET:?'LANDING_S3_PROD_BUCKET environment variable is required'}"
    DEV_DISTRIBUTION_ID="${LANDING_CF_DEV_DISTRIBUTION_ID:-}"
    PROD_DISTRIBUTION_ID="${LANDING_CF_PROD_DISTRIBUTION_ID:-}"
}

setup_aws_profile() {
    if [ "${GITHUB_ACTIONS:-}" = "true" ]; then
        log_info "Running in GitHub Actions - using default AWS credentials"
        AWS_PROFILE=""
    elif [ -n "${AWS_DEPLOY_PROFILE:-}" ]; then
        log_info "Using AWS profile: ${AWS_DEPLOY_PROFILE}"
        AWS_PROFILE="--profile ${AWS_DEPLOY_PROFILE}"
    else
        log_error "AWS_DEPLOY_PROFILE is not set. Please configure scripts/.env.deploy"
        exit 1
    fi
}

get_bucket_name() {
    local deploy_env="$1"

    if [ "$deploy_env" = "dev" ]; then
        echo "$DEV_BUCKET_NAME"
    else
        echo "$PROD_BUCKET_NAME"
    fi
}

get_distribution_id() {
    local deploy_env="$1"

    if [ "$deploy_env" = "dev" ]; then
        echo "$DEV_DISTRIBUTION_ID"
    else
        echo "$PROD_DISTRIBUTION_ID"
    fi
}

get_domain_name() {
    local deploy_env="$1"

    if [ "$deploy_env" = "dev" ]; then
        echo "app-dev.chatic.io"
    else
        echo "app.chatic.io"
    fi
}

validate_environment() {
    local deploy_env="$1"

    if [ ! -d "${DIST_DIR}" ]; then
        log_error "Build directory ${DIST_DIR} does not exist"
        log_error "Please run 'yarn landing:build:${deploy_env}' first"
        exit 1
    fi

    if [ ! -f "${DIST_DIR}/index.html" ]; then
        log_error "index.html not found in ${DIST_DIR}"
        log_error "Build may have failed"
        exit 1
    fi

    if [ ! -d "${WELL_KNOWN_DIR}" ]; then
        log_error ".well-known directory not found: ${WELL_KNOWN_DIR}"
        log_error "Deep linking configuration files are missing!"
        exit 1
    fi

    if [ ! -f "${WELL_KNOWN_DIR}/apple-app-site-association" ]; then
        log_error "apple-app-site-association not found"
        exit 1
    fi

    if [ ! -f "${WELL_KNOWN_DIR}/assetlinks.json" ]; then
        log_error "assetlinks.json not found"
        exit 1
    fi
}

print_deployment_info() {
    local deploy_env="$1"
    local bucket_name="$2"
    local distribution_id="$3"
    local domain_name="$4"

    log_info "================================"
    log_info "Landing Deployment Configuration"
    log_info "================================"
    log_info "Environment: ${deploy_env}"
    log_info "Domain: https://${domain_name}"
    log_info "S3 Bucket: s3://${bucket_name}"
    log_info "Source: ${DIST_DIR}"
    log_info "CloudFront: ${distribution_id}"
    log_info "AWS Profile: ${AWS_PROFILE:-default}"
    log_info ".well-known: ${WELL_KNOWN_DIR}"
    log_info "================================"
}

sync_static_assets() {
    local bucket_name="$1"
    local s3_target="s3://${bucket_name}"

    log_info "Syncing static assets (excluding HTML, CSS, JS, version.json, .well-known)..."

    if ! aws s3 ${AWS_PROFILE} sync "${DIST_DIR}" "${s3_target}" \
        --metadata-directive REPLACE \
        --exclude "index.html" \
        --exclude "version.json" \
        --exclude "*.css" \
        --exclude "*.js" \
        --exclude ".well-known/*"; then
        log_error "Failed to sync static assets"
        return 1
    fi

    log_success "Static assets synced"
}

sync_css_js_files() {
    local bucket_name="$1"
    local s3_target="s3://${bucket_name}"

    log_info "Syncing CSS and JavaScript files..."

    if ! aws s3 ${AWS_PROFILE} sync "${DIST_DIR}" "${s3_target}" \
        --metadata-directive REPLACE \
        --exclude "*" \
        --include "*.css" \
        --include "*.js" \
        --exclude "assets/*"; then
        log_error "Failed to sync CSS/JS files"
        return 1
    fi

    log_success "CSS/JS files synced"
}

sync_asset_files() {
    local bucket_name="$1"
    local s3_target="s3://${bucket_name}"

    log_info "Syncing asset files..."

    if ! aws s3 ${AWS_PROFILE} sync "${DIST_DIR}" "${s3_target}" \
        --metadata-directive REPLACE \
        --exclude "*" \
        --include "assets/*"; then
        log_error "Failed to sync asset files"
        return 1
    fi

    log_success "Asset files synced"
}

upload_index_html() {
    local bucket_name="$1"
    local s3_target="s3://${bucket_name}/index.html"

    log_info "Uploading index.html with no-cache headers..."

    if ! aws s3 ${AWS_PROFILE} cp "${DIST_DIR}/index.html" "${s3_target}" \
        --metadata-directive REPLACE \
        --cache-control "${CACHE_CONTROL_NO_CACHE}" \
        --content-type "text/html" \
        ; then
        log_error "Failed to upload index.html"
        return 1
    fi

    log_success "index.html uploaded"
}

generate_version_json() {
    log_info "Generating version.json..."

    if [ ! -f "${PKG_FILE}" ]; then
        log_error "Package.json not found: ${PKG_FILE}"
        return 1
    fi

    local version
    version=$(node -p "require('${PKG_FILE}').version")
    local build_time
    build_time=$(date -u +"%Y-%m-%dT%H:%M:%SZ")

    cat > "${DIST_DIR}/version.json" << EOF
{
  "version": "${version}",
  "buildTime": "${build_time}"
}
EOF

    log_success "Generated version.json with version ${version}"
}

upload_version_json() {
    local bucket_name="$1"
    local s3_target="s3://${bucket_name}/version.json"

    if [ ! -f "${DIST_DIR}/version.json" ]; then
        log_info "version.json not found, skipping..."
        return 0
    fi

    log_info "Uploading version.json with no-cache headers..."

    if ! aws s3 ${AWS_PROFILE} cp "${DIST_DIR}/version.json" "${s3_target}" \
        --metadata-directive REPLACE \
        --cache-control "${CACHE_CONTROL_NO_CACHE}" \
        --content-type "application/json" \
        ; then
        log_error "Failed to upload version.json"
        return 1
    fi

    log_success "version.json uploaded"
}

upload_well_known_files() {
    local bucket_name="$1"

    log_info "Uploading .well-known files for deep linking..."
    log_warning "These files are CRITICAL for iOS Universal Links and Android App Links!"

    # Replace REDACTED_TEAM_ID with actual Apple Team ID in AASA file
    local aasa_file="${WELL_KNOWN_DIR}/apple-app-site-association"
    if [ -n "${APPLE_TEAM_ID:-}" ]; then
        log_info "Replacing REDACTED_TEAM_ID with actual Apple Team ID..."
        sed -i.bak "s/REDACTED_TEAM_ID/${APPLE_TEAM_ID}/g" "$aasa_file"
        rm -f "${aasa_file}.bak"
    elif grep -q "REDACTED_TEAM_ID" "$aasa_file"; then
        log_error "AASA file contains REDACTED_TEAM_ID but APPLE_TEAM_ID env var is not set!"
        log_error "Set APPLE_TEAM_ID in .env.deploy or GitHub Secrets"
        return 1
    fi

    # Upload apple-app-site-association (no file extension, must be application/json)
    log_info "Uploading apple-app-site-association..."
    if ! aws s3 ${AWS_PROFILE} cp "${WELL_KNOWN_DIR}/apple-app-site-association" \
        "s3://${bucket_name}/.well-known/apple-app-site-association" \
        --metadata-directive REPLACE \
        --cache-control "${CACHE_CONTROL_WELL_KNOWN}" \
        --content-type "application/json" \
        ; then
        log_error "Failed to upload apple-app-site-association"
        return 1
    fi
    log_success "apple-app-site-association uploaded"

    # Upload assetlinks.json
    log_info "Uploading assetlinks.json..."
    if ! aws s3 ${AWS_PROFILE} cp "${WELL_KNOWN_DIR}/assetlinks.json" \
        "s3://${bucket_name}/.well-known/assetlinks.json" \
        --metadata-directive REPLACE \
        --cache-control "${CACHE_CONTROL_WELL_KNOWN}" \
        --content-type "application/json" \
        ; then
        log_error "Failed to upload assetlinks.json"
        return 1
    fi
    log_success "assetlinks.json uploaded"

    log_success ".well-known files uploaded successfully"
}

verify_well_known_files() {
    local bucket_name="$1"
    local domain_name="$2"

    log_info "Verifying .well-known files..."

    # Check if files exist in S3
    if aws s3 ${AWS_PROFILE} ls "s3://${bucket_name}/.well-known/apple-app-site-association" > /dev/null 2>&1; then
        log_success "apple-app-site-association exists in S3"
    else
        log_error "apple-app-site-association NOT found in S3!"
        return 1
    fi

    if aws s3 ${AWS_PROFILE} ls "s3://${bucket_name}/.well-known/assetlinks.json" > /dev/null 2>&1; then
        log_success "assetlinks.json exists in S3"
    else
        log_error "assetlinks.json NOT found in S3!"
        return 1
    fi

    log_info "Deep linking files verified. After CloudFront invalidation, verify at:"
    log_info "  https://${domain_name}/.well-known/apple-app-site-association"
    log_info "  https://${domain_name}/.well-known/assetlinks.json"
}

invalidate_cloudfront() {
    local distribution_id="$1"

    if [ -z "${distribution_id}" ]; then
        log_info "Skipping CloudFront invalidation (distribution ID not configured)"
        return 0
    fi

    log_info "Creating CloudFront invalidation..."

    local invalidation_output
    if invalidation_output=$(aws cloudfront ${AWS_PROFILE} create-invalidation \
        --distribution-id "${distribution_id}" \
        --paths '/*' \
        --no-cli-pager 2>&1); then
        log_success "CloudFront invalidation created"
        echo "${invalidation_output}" | grep -E "(Id|Status|CreateTime)" || true
    else
        log_error "Failed to create CloudFront invalidation"
        echo "${invalidation_output}" >&2
        return 1
    fi
}

# Main execution
main() {
    local deploy_env="$1"
    local bucket_name
    local distribution_id
    local domain_name

    log_info "Landing deployment script started"

    # Setup and get configuration
    load_env_file
    load_deploy_config
    setup_aws_profile
    bucket_name=$(get_bucket_name "$deploy_env")
    distribution_id=$(get_distribution_id "$deploy_env")
    domain_name=$(get_domain_name "$deploy_env")

    # Validation
    validate_environment "$deploy_env"
    print_deployment_info "$deploy_env" "$bucket_name" "$distribution_id" "$domain_name"

    # Execute deployment steps
    log_info "Starting deployment..."

    generate_version_json
    sync_static_assets "$bucket_name"
    sync_css_js_files "$bucket_name"
    sync_asset_files "$bucket_name"
    upload_index_html "$bucket_name"
    upload_version_json "$bucket_name"

    # CRITICAL: Upload .well-known files for deep linking
    upload_well_known_files "$bucket_name"
    verify_well_known_files "$bucket_name" "$domain_name"

    # Invalidate CloudFront cache
    invalidate_cloudfront "$distribution_id"

    log_success "================================"
    log_success "Deployment completed successfully!"
    log_success "================================"
    log_success "Environment: ${deploy_env}"
    log_success "Domain: https://${domain_name}"
    log_success "S3 Bucket: s3://${bucket_name}"
    log_success ""
    log_success "Deep Link Verification URLs:"
    log_success "  https://${domain_name}/.well-known/apple-app-site-association"
    log_success "  https://${domain_name}/.well-known/assetlinks.json"
    log_success "  https://${domain_name}/s/test (deep link test)"
    log_success "================================"
}

# Validate arguments and run main function
validate_arguments "$@"
main "$1"
