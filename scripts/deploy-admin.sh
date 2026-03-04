#!/bin/bash
set -euo pipefail

# Constants
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
APP_NAME="admin"
BUCKET_NAME="chatic-front-admin"
DEV_DISTRIBUTION_ID="E3SWKUSXOL1R8W"        # TODO: Update with actual CloudFront distribution ID
PROD_DISTRIBUTION_ID="E3JFTMIF4CLYZ5"       # TODO: Update with actual CloudFront distribution ID
DIST_DIR="${PROJECT_ROOT}/dist/apps/${APP_NAME}"
CACHE_CONTROL_NO_CACHE="max-age=0,no-cache,no-store,must-revalidate"
CACHE_CONTROL_LOCALES="max-age=0,s-maxage=0,no-cache,no-store,must-revalidate,proxy-revalidate"
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

show_usage() {
    echo "Usage: $0 [environment]"
    echo ""
    echo "Arguments:"
    echo "  environment    Optional deployment environment (dev or prod)"
    echo "                 If not provided, deploys to root bucket"
    echo ""
    echo "Examples:"
    echo "  $0             Deploy to root bucket (s3://bucket-name/)"
    echo "  $0 dev         Deploy to development environment"
    echo "  $0 prod        Deploy to PROD environment"
}

validate_arguments() {
    if [ $# -gt 1 ]; then
        log_error "Too many arguments provided"
        show_usage
        exit 1
    fi

    if [ $# -eq 1 ]; then
        local deploy_env="$1"
        if [[ "$deploy_env" != "dev" && "$deploy_env" != "prod" ]]; then
            log_error "Invalid environment: $deploy_env"
            log_error "Valid environments: dev, prod"
            exit 1
        fi
    fi
}

setup_aws_profile() {
    if [ "${GITHUB_ACTIONS:-}" = "true" ]; then
        log_info "Running in GitHub Actions - using default AWS credentials"
        AWS_PROFILE=""
    else
        log_info "Using AWS profile: lemon"
        AWS_PROFILE="--profile lemon"
    fi
}

validate_environment() {
    local deploy_env="${1:-}"

    if [ ! -d "${DIST_DIR}" ]; then
        log_error "Build directory ${DIST_DIR} does not exist"
        if [ -n "$deploy_env" ]; then
            log_error "Please run 'yarn admin:build:${deploy_env}' first"
        else
            log_error "Please run 'yarn admin:build' first"
        fi
        exit 1
    fi

    if [ ! -f "${DIST_DIR}/index.html" ]; then
        log_error "index.html not found in ${DIST_DIR}"
        log_error "Build may have failed"
        exit 1
    fi
}

get_distribution_id() {
    local deploy_env="${1:-}"

    if [ "$deploy_env" = "dev" ]; then
        echo "$DEV_DISTRIBUTION_ID"
    elif [ "$deploy_env" = "prod" ]; then
        echo "$PROD_DISTRIBUTION_ID"
    else
        echo ""
    fi
}

print_deployment_info() {
    local deploy_env="${1:-}"
    local distribution_id="$2"

    log_info "================================"
    log_info "AWS S3 Deployment Configuration"
    log_info "================================"
    if [ -n "$deploy_env" ]; then
        log_info "Environment: ${deploy_env}"
        log_info "S3 Target: s3://${BUCKET_NAME}/${deploy_env}"
    else
        log_info "Environment: root (no environment)"
        log_info "S3 Target: s3://${BUCKET_NAME}/"
    fi
    log_info "Source: ${DIST_DIR}"
    if [ -n "${distribution_id}" ] && [ "${distribution_id}" != "TODO" ]; then
        log_info "CloudFront: ${distribution_id}"
    else
        log_info "CloudFront: Not configured (will skip invalidation)"
    fi
    log_info "AWS Profile: ${AWS_PROFILE:-default}"
    log_info "================================"
}

sync_static_assets() {
    local deploy_env="${1:-}"
    local s3_target

    if [ -n "$deploy_env" ]; then
        s3_target="s3://${BUCKET_NAME}/${deploy_env}"
    else
        s3_target="s3://${BUCKET_NAME}"
    fi

    log_info "Syncing static assets (excluding HTML, CSS, JS, locales, version.json)..."

    if ! aws s3 ${AWS_PROFILE} sync "${DIST_DIR}" "${s3_target}" \
        --metadata-directive REPLACE \
        --acl public-read \
        --exclude "index.html" \
        --exclude "version.json" \
        --exclude "*.css" \
        --exclude "*.js" \
        --exclude "locales/*"; then
        log_error "Failed to sync static assets"
        return 1
    fi

    log_success "Static assets synced"
}

sync_css_js_files() {
    local deploy_env="${1:-}"
    local s3_target

    if [ -n "$deploy_env" ]; then
        s3_target="s3://${BUCKET_NAME}/${deploy_env}"
    else
        s3_target="s3://${BUCKET_NAME}"
    fi

    log_info "Syncing CSS and JavaScript files..."

    if ! aws s3 ${AWS_PROFILE} sync "${DIST_DIR}" "${s3_target}" \
        --metadata-directive REPLACE \
        --acl public-read \
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
    local deploy_env="${1:-}"
    local s3_target

    if [ -n "$deploy_env" ]; then
        s3_target="s3://${BUCKET_NAME}/${deploy_env}"
    else
        s3_target="s3://${BUCKET_NAME}"
    fi

    log_info "Syncing asset files..."

    if ! aws s3 ${AWS_PROFILE} sync "${DIST_DIR}" "${s3_target}" \
        --metadata-directive REPLACE \
        --acl public-read \
        --exclude "*" \
        --include "assets/*"; then
        log_error "Failed to sync asset files"
        return 1
    fi

    log_success "Asset files synced"
}

sync_locales() {
    local deploy_env="${1:-}"
    local s3_target
    local locales_dir="${DIST_DIR}/locales"

    if [ -n "$deploy_env" ]; then
        s3_target="s3://${BUCKET_NAME}/${deploy_env}/locales"
    else
        s3_target="s3://${BUCKET_NAME}/locales"
    fi

    if [ -d "${locales_dir}" ]; then
        log_info "Syncing locale files..."

        if ! aws s3 ${AWS_PROFILE} sync "${locales_dir}" "${s3_target}" \
            --metadata-directive REPLACE \
            --acl public-read \
            --cache-control "${CACHE_CONTROL_LOCALES}"; then
            log_error "Failed to sync locale files"
            return 1
        fi

        log_success "Locale files synced"
    else
        log_info "No locales directory found, skipping..."
    fi
}

upload_index_html() {
    local deploy_env="${1:-}"
    local s3_target

    if [ -n "$deploy_env" ]; then
        s3_target="s3://${BUCKET_NAME}/${deploy_env}/index.html"
    else
        s3_target="s3://${BUCKET_NAME}/index.html"
    fi

    log_info "Uploading index.html with no-cache headers..."

    if ! aws s3 ${AWS_PROFILE} cp "${DIST_DIR}/index.html" "${s3_target}" \
        --metadata-directive REPLACE \
        --cache-control "${CACHE_CONTROL_NO_CACHE}" \
        --content-type "text/html" \
        --acl public-read; then
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
    local deploy_env="${1:-}"
    local s3_target

    if [ -n "$deploy_env" ]; then
        s3_target="s3://${BUCKET_NAME}/${deploy_env}/version.json"
    else
        s3_target="s3://${BUCKET_NAME}/version.json"
    fi

    if [ ! -f "${DIST_DIR}/version.json" ]; then
        log_info "version.json not found, skipping..."
        return 0
    fi

    log_info "Uploading version.json with no-cache headers..."

    if ! aws s3 ${AWS_PROFILE} cp "${DIST_DIR}/version.json" "${s3_target}" \
        --metadata-directive REPLACE \
        --cache-control "${CACHE_CONTROL_NO_CACHE}" \
        --content-type "application/json" \
        --acl public-read; then
        log_error "Failed to upload version.json"
        return 1
    fi

    log_success "version.json uploaded"
}

invalidate_cloudfront() {
    local deploy_env="${1:-}"
    local distribution_id="$2"

    if [ -z "${distribution_id}" ] || [ "${distribution_id}" = "TODO" ]; then
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
    local deploy_env="${1:-}"
    local distribution_id

    log_info "AWS S3 deployment script started"

    # Setup and validation
    setup_aws_profile
    validate_environment "$deploy_env"
    distribution_id=$(get_distribution_id "$deploy_env")
    print_deployment_info "$deploy_env" "$distribution_id"

    # Execute deployment steps
    local steps=(
        "generate_version_json"
        "sync_static_assets"
        "sync_css_js_files"
        "sync_asset_files"
        "sync_locales"
        "upload_index_html"
        "upload_version_json"
        "invalidate_cloudfront"
    )

    for step in "${steps[@]}"; do
        if [ "$step" = "invalidate_cloudfront" ]; then
            if ! ${step} "$deploy_env" "$distribution_id"; then
                log_error "Deployment failed at step: ${step}"
                exit 1
            fi
        else
            if ! ${step} "$deploy_env"; then
                log_error "Deployment failed at step: ${step}"
                exit 1
            fi
        fi
    done

    log_success "================================"
    log_success "Deployment completed successfully!"
    if [ -n "$deploy_env" ]; then
        log_success "Environment: ${deploy_env}"
        log_success "S3 URL: http://${BUCKET_NAME}.s3-website.ap-northeast-2.amazonaws.com/${deploy_env}/index.html"
    else
        log_success "Environment: root (no environment)"
        log_success "S3 URL: http://${BUCKET_NAME}.s3-website.ap-northeast-2.amazonaws.com/index.html"
    fi
    log_success "================================"
}

# Validate arguments and run main function
validate_arguments "$@"
main "${1:-}"
