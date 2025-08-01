#!/bin/bash
set -euo pipefail

# Constants
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
ENV_FILE="${PROJECT_ROOT}/.env.docker"
DOCKER_IMAGE_NAME="codes-front-sample"
DOCKER_IMAGE_TAG="prod"

# Functions
log_error() {
    echo "[ERROR] $1" >&2
}

log_info() {
    echo "[INFO] $1"
}

validate_env_file() {
    if [ ! -f "${ENV_FILE}" ]; then
        log_error ".env.docker not found. Copy from .env.docker.example"
        exit 1
    fi
}

load_env_variables() {
    log_info "Loading environment variables from ${ENV_FILE}"
    # shellcheck disable=SC2046
    export $(grep -v '^#' "${ENV_FILE}" | xargs)
}

validate_required_vars() {
    local required_vars=(
        "AWS_DEPLOY_TARGET"
        "AWS_BUCKET_NAME"
        "AWS_ACCESS_KEY_ID"
        "AWS_SECRET_ACCESS_KEY"
        "APP_NAME"
        "VITE_ENV"
        "VITE_PROJECT"
        "VITE_HOST"
        "VITE_OAUTH_ENDPOINT"
    )

    for var in "${required_vars[@]}"; do
        if [ -z "${!var:-}" ]; then
            log_error "Required environment variable ${var} is not set"
            exit 1
        fi
    done
    
    # CloudFront distribution ID is optional
    if [ -n "${AWS_DISTRIBUTION_ID:-}" ]; then
        log_info "CloudFront invalidation will be performed"
    else
        log_info "AWS_DISTRIBUTION_ID not set - CloudFront invalidation will be skipped"
    fi
}

print_deployment_info() {
    log_info "================================"
    log_info "Docker Deployment Configuration"
    log_info "================================"
    log_info "Environment: ${AWS_DEPLOY_TARGET}"
    log_info "S3 Target: s3://${AWS_BUCKET_NAME}/${AWS_DEPLOY_TARGET}"
    if [ -n "${AWS_DISTRIBUTION_ID:-}" ]; then
        log_info "CloudFront: ${AWS_DISTRIBUTION_ID}"
    else
        log_info "CloudFront: Not configured (will skip invalidation)"
    fi
    log_info "Docker Image: ${DOCKER_IMAGE_NAME}:${DOCKER_IMAGE_TAG}"
    log_info "================================"
}

clean_build_artifacts() {
    log_info "Cleaning build artifacts..."
    rm -rf "${PROJECT_ROOT}/node_modules/.vite" "${PROJECT_ROOT}/node_modules/.cache" || true
    rm -rf "${PROJECT_ROOT}/.nx" || true
    rm -rf "${PROJECT_ROOT}/dist/apps/web" || true
}

build_docker_image() {
    log_info "Building Docker image..."

    if ! docker build \
    --build-arg VITE_ENV="$VITE_ENV" \
    --build-arg VITE_PROJECT="$VITE_PROJECT" \
    --build-arg VITE_HOST="$VITE_HOST" \
    --build-arg VITE_OAUTH_ENDPOINT="$VITE_OAUTH_ENDPOINT" \
    --build-arg VITE_SOCIAL_OAUTH_ENDPOINT="$VITE_SOCIAL_OAUTH_ENDPOINT" \
    --build-arg VITE_IMAGE_API_ENDPOINT="$VITE_IMAGE_API_ENDPOINT" \
    -t "${DOCKER_IMAGE_NAME}:${DOCKER_IMAGE_TAG}" \
    -f "${PROJECT_ROOT}/docker/web/Dockerfile" \
    "${PROJECT_ROOT}"; then
        log_error "Docker build failed"
        exit 1
    fi

    log_info "Docker image built successfully"
}

deploy_with_docker() {
    log_info "Running deployment in Docker container..."

    # Build Docker run command with required environment variables
    local docker_cmd=(
        "docker" "run" "--rm"
        "-e" "AWS_ACCESS_KEY_ID=$AWS_ACCESS_KEY_ID"
        "-e" "AWS_SECRET_ACCESS_KEY=$AWS_SECRET_ACCESS_KEY"
        "-e" "AWS_REGION=$AWS_REGION"
        "-e" "AWS_BUCKET_NAME=$AWS_BUCKET_NAME"
        "-e" "AWS_DEPLOY_TARGET=$AWS_DEPLOY_TARGET"
        "-e" "APP_NAME=$APP_NAME"
    )
    
    # Add CloudFront distribution ID only if it's set
    if [ -n "${AWS_DISTRIBUTION_ID:-}" ]; then
        docker_cmd+=("-e" "AWS_DISTRIBUTION_ID=$AWS_DISTRIBUTION_ID")
    fi
    
    # Add image and command
    docker_cmd+=("${DOCKER_IMAGE_NAME}:${DOCKER_IMAGE_TAG}" "/app/scripts/docker-entrypoint-deploy.sh")
    
    if ! "${docker_cmd[@]}"; then
        log_error "Docker deployment failed"
        exit 1
    fi

    log_info "Deployment completed successfully"
}

# Main execution
main() {
    validate_env_file
    load_env_variables
    validate_required_vars
    print_deployment_info
    clean_build_artifacts
    build_docker_image
    deploy_with_docker
}

main "$@"
