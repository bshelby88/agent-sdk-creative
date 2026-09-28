# Security Policy — @tiffany/agent-sdk-creative

## Reporting a Vulnerability

We take the security of the RAEN fleet creative-integrator SDK seriously. If you discover a security vulnerability, please follow these steps:

### Disclosure Process

1. **Do not** publish or discuss the vulnerability publicly until it has been patched.
2. Report the vulnerability via a private GitHub security advisory or by contacting the maintainers.
3. The maintainers will acknowledge receipt within 48 hours.
4. A fix will be targeted for the next security patch release.

### Supported Versions

| Version | Supported          |
| ------- | ------------------ |
| 1.0.x   | ✅ Active           |
| < 1.0   | ❌ No support       |

### Security Scanning

The following security measures are automated via GitHub Actions:

- **npm audit** on every push and PR (high/critical severity blocks)
- **TruffleHog** secret scanning on every push
- **Daily scheduled audit** at 06:00 UTC

### Security Contact

- **Repository**: `bshelby88/agent-sdk-creative`
- **Owner**: Bryant Shelby (@bshelby88)
- **RAEN Fleet**: Bryant Shelby, Creative-Integrator

### Key Management

- Secrets are managed via GitHub Actions Secrets
- Fly.io API tokens: `FLY_API_TOKEN`
- Airtable API keys: `AIRTABLE_API_KEY`, `AIRTABLE_BASE_ID`
- OpenRouter API keys: `OPENROUTER_API_KEY`
- Never commit secrets to the repository

### Response Timeline

| Severity   | Response Time |
| ---------- | ------------- |
| Critical   | 24 hours      |
| High       | 48 hours      |
| Medium     | 1 week        |
| Low        | Next release  |
