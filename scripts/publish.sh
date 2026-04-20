#!/bin/bash
set -e

# Configuration
DOCKERHUB_USERNAME="raumain"
IMAGE_NAME="omnidump"

# Ensure version argument is provided
if [ -z "$1" ]; then
  echo "Error: Version tag is required."
  echo "Usage: ./scripts/publish.sh <version> (e.g., ./scripts/publish.sh v1.0.0)"
  exit 1
fi

VERSION=$1

echo "Building and publishing OmniDump version $VERSION for linux/amd64..."

# Build and push using Buildx for platform compatibility
docker buildx build \
  --platform linux/amd64 \
  -f Dockerfile \
  -t "$DOCKERHUB_USERNAME/$IMAGE_NAME:latest" \
  -t "$DOCKERHUB_USERNAME/$IMAGE_NAME:$VERSION" \
  --push \
  .

echo "✅ Successfully published $DOCKERHUB_USERNAME/$IMAGE_NAME:$VERSION to Docker Hub!"
