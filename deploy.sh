#!/usr/bin/env bash
# =============================================================================
# Staci Deployment Script — agent-sdk-creative
# =============================================================================
# Deploy the creative-integrator SDK to Fly.io.
# Usage: ./deploy.sh [staging|production] [--skip-tests]
# =============================================================================
# Run with: bash deploy.sh production
# =============================================================================

set -euo pipefail

# ─── Configuration ────────────────────────────────────────────
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR" && pwd)"
APP_NAME="tiffany-creative"
REGION="${FLY_REGION:-iad}"
MEMORY="${FLY_MEMORY:-512}"
CPUS="${FLY_CPUS:-1}"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

log() { echo -e "${GREEN}[DEPLOY]${NC} $1"; }
warn() { echo -e "${YELLOW}[WARN]${NC} $1"; }
error() { echo -e "${RED}[ERROR]${NC} $1"; exit 1; }

# ─── Pre-flight Checks ────────────────────────────────────────
check_prerequisites() {
    log "Checking prerequisites..."

    # Check Fly CLI
    if ! command -v fly &>/dev/null; then
        error "Fly CLI not found. Install with: curl -L https://fly.io/install.sh | sh"
    fi
    log "✓ Fly CLI found"

    # Check GitHub CLI
    if ! command -v gh &>/dev/null; then
        error "GitHub CLI not found. Install from https://cli.github.com/"
    fi
    log "✓ GitHub CLI found"

    # Check Node.js
    if ! command -v node &>/dev/null; then
        error "Node.js not found"
    fi
    log "✓ Node.js $(node --version) found"

    # Check npm
    if ! command -v npm &>/dev/null; then
        error "npm not found"
    fi
    log "✓ npm $(npm --version) found"

    # Check Fly auth
    if ! fly auth whoami &>/dev/null 2>&1; then
        error "Fly CLI not authenticated. Run: fly auth login"
    fi
    log "✓ Fly CLI authenticated"

    # Check GitHub token
    if ! gh auth status &>/dev/null 2>&1; then
        error "GitHub CLI not authenticated. Run: gh auth login"
    fi
    log "✓ GitHub CLI authenticated"
}

# ─── Build ─────────────────────────────────────────────────────
build_project() {
    log "Building project..."
    cd "$PROJECT_DIR"

    # Install dependencies
    npm ci --prefer-offline 2>&1

    # Type-check
    npx tsc --noEmit 2>&1
    log "✓ TypeScript compilation passed"

    # Build
    npm run build 2>&1
    log "✓ Build complete → dist/"
}

# ─── Test ──────────────────────────────────────────────────────
run_tests() {
    local skip_tests="${1:-false}"
    if [ "$skip_tests" = "--skip-tests" ]; then
        warn "Skipping tests per --skip-tests flag"
        return
    fi

    log "Running x402 surface validation..."
    cd "$PROJECT_DIR"

    # Validate all surface types
    npx tsx -e "
      const { generate_x402_surface } = require('./dist/creative-tools.js');
      const surfaces = ['x402.json', 'llms.txt', 'pricing.md', 'sample'];
      for (const st of surfaces) {
        const result = generate_x402_surface.execute({
          surfaceType: st,
          serviceName: 'tiffany-creative',
          serviceDescription: 'Creative-integrator service',
          price: '\$0.10',
          payTo: '0x7861db4efc14a1ed5dd8c96c528a3796560f1393',
          baseUrl: 'https://tiffany-creative.fly.dev',
          capabilities: ['/api/generate', '/api/batch']
        });
        if (!result.content || result.content.length === 0) {
          console.error('FAIL: Empty content for ' + st);
          process.exit(1);
        }
        console.log('✓ ' + st + ' validated');
      }
    " 2>&1
    log "✓ All x402 surfaces validated"
}

# ─── Deploy ────────────────────────────────────────────────────
deploy() {
    local env="${1:-production}"
    cd "$PROJECT_DIR"

    log "Deploying to Fly.io ($env)..."

    if [ "$env" = "staging" ]; then
        APP_NAME="tiffany-creative-staging"
    fi

    # Deploy to Fly.io
    fly deploy \
        --remote-only \
        --build-arg NODE_VERSION=22 \
        --memory "$MEMORY" \
        --cpus "$CPUS" \
        --region "$REGION" \
        2>&1

    log "✓ Deployment initiated for $APP_NAME"
}

# ─── Post-deploy Verification ─────────────────────────────────
verify_deployment() {
    local env="${1:-production}"
    local base_url="https://${APP_NAME}.fly.dev"

    log "Verifying deployment at $base_url..."

    # Wait for deployment
    log "Waiting 15 seconds for startup..."
    sleep 15

    # Check health
    local status
    status=$(curl -sf "$base_url/health" 2>/dev/null || echo "FAIL")
    if [ "$status" = "FAIL" ]; then
        warn "Health check failed, trying x402 manifest..."
        status=$(curl -sf "$base_url/.well-known/x402.json" 2>/dev/null || echo "FAIL")
    fi

    if [ "$status" != "FAIL" ]; then
        log "✓ Deployment verified — endpoint responding"
        curl -sf "$base_url/.well-known/x402.json" 2>/dev/null | head -c 200
        echo ""
    else
        error "Deployment verification failed — check Fly dashboard"
    fi
}

# ─── Sync to Airtable ─────────────────────────────────────────
sync_to_airtable() {
    log "Syncing to Airtable..."

    # Use the fleet GitHub-to-Airtable sync pipeline
    # Token from: C:/Users/jaded/AppData/Local/hermes/scripts/fleet_health_20260907/.airtable_creds.json
    if [ -f "/c/Users/jaded/AppData/Local/hermes/scripts/fleet_health_20260907/.airtable_creds.json" ]; then
        log "✓ Airtable credentials found"
        # Call the sync pipeline
        # python3 /c/Users/jaded/OneDrive/Documents/fleet-workflows/scan-results/gh_sync/sync.py 2>/dev/null || \
        #     warn "Airtable sync skipped — pipeline not available"
    else
        warn "Airtable credentials not found — sync skipped"
    fi
}

# ─── Branch Protection Setup ──────────────────────────────────
setup_branch_protection() {
    log "Setting up branch protection for main..."

    curl -s -X PUT \
        -H "Authorization: token $(gh auth token)" \
        -H "Accept: application/vnd.github.luke-cage-preview+json" \
        "https://api.github.com/repos/bshelby88/agent-sdk-creative/branches/main/protection" \
        -d '{
            "required_status_checks": {
                "strict": true,
                "contexts": ["ci/typecheck", "ci/security-audit", "ci/x402-tests"]
            },
            "enforce_admins": false,
            "required_pull_request_reviews": {
                "required_approving_review_count": 1,
                "require_code_owner_reviews": false,
                "require_last_review_approval": true
            },
            "restrictions": null,
            "require_conversation_resolution": true,
            "require_linear_history": true,
            "allow_force_pushes": false,
            "allow_deletions": false
        }' 2>&1

    log "✓ Branch protection configured"
}

# ─── Main ──────────────────────────────────────────────────────
main() {
    local ENVIRONMENT="${1:-production}"
    local SKIP_TESTS="${2:-}"

    echo "============================================="
    echo "  Staci Deployment — agent-sdk-creative"
    echo "  Environment: $ENVIRONMENT"
    echo "============================================="
    echo ""

    check_prerequisites
    build_project
    run_tests "$SKIP_TESTS"
    deploy "$ENVIRONMENT"
    verify_deployment "$ENVIRONMENT"
    sync_to_airtable
    setup_branch_protection

    echo ""
    log "Deployment complete ✓"
    log "App: $APP_NAME"
    log "URL: https://${APP_NAME}.fly.dev"
}

main "$@"
