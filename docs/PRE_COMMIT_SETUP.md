# Pre-commit Hooks Setup

This project uses pre-commit hooks to ensure code quality, security, and consistency across all commits. The hooks automatically run linting, type checking, formatting, and security scans before each commit.

## Quick Setup

Run the setup script to install and configure all pre-commit hooks:

```bash
./scripts/setup-pre-commit.sh
```

This script will:
- Install pre-commit if not already installed
- Install all necessary Go tools (goimports, golangci-lint)
- Install the git hook scripts
- Set up commit message templates
- Test the configuration

## Manual Setup

If you prefer to set up manually:

1. **Install pre-commit:**
   ```bash
   pip install pre-commit
   # or
   brew install pre-commit
   ```

2. **Install the git hooks:**
   ```bash
   pre-commit install
   pre-commit install --hook-type commit-msg
   ```

3. **Install Go tools:**
   ```bash
   cd backend
   go install golang.org/x/tools/cmd/goimports@latest
   go install github.com/golangci/golangci-lint/cmd/golangci-lint@latest
   ```

4. **Install Node.js dependencies:**
   ```bash
   npm install
   ```

## What Gets Checked

### 🔒 Security
- **Gitleaks**: Scans for hardcoded secrets, API keys, and credentials
- **Configuration**: `.gitleaks.toml`

### 🐹 Go Code Quality
- **gofmt**: Code formatting
- **goimports**: Import organization
- **go vet**: Static analysis
- **go mod tidy**: Dependency management
- **golangci-lint**: Comprehensive linting with 40+ linters
- **go test**: Run tests on modified Go files
- **go build**: Ensure code compiles

### 🟨 TypeScript/JavaScript
- **ESLint**: Linting with Next.js configuration
- **Prettier**: Code formatting
- **TypeScript**: Type checking
- **Next.js build**: Ensure application builds successfully

### 📁 File Quality
- **Trailing whitespace**: Removed automatically
- **End of file**: Ensure files end with newline
- **Line endings**: Normalize to LF
- **Large files**: Prevent commits of files >10MB
- **Merge conflicts**: Detect unresolved conflicts

### 📝 Documentation
- **Markdown**: Lint and format with markdownlint
- **JSON/YAML/TOML**: Syntax validation

### 🐳 Infrastructure
- **Dockerfile**: Lint with hadolint
- **Serverless configs**: Validate YAML syntax

## Configuration Files

| File | Purpose |
|------|---------|
| `.pre-commit-config.yaml` | Main pre-commit configuration |
| `.gitleaks.toml` | Secret detection rules |
| `backend/.golangci.yml` | Go linting configuration |
| `.markdownlint.json` | Markdown linting rules |
| `.gitmessage` | Commit message template |

## Usage

### Automatic (Recommended)
Hooks run automatically on every `git commit`. If any hook fails, the commit is blocked.

### Manual Execution
```bash
# Run all hooks on all files
pre-commit run --all-files

# Run specific hook
pre-commit run gitleaks
pre-commit run golangci-lint-mod

# Run hooks on specific files
pre-commit run --files src/components/Button.tsx
```

### Skip Hooks (Not Recommended)
```bash
# Skip all hooks (emergency only)
git commit --no-verify

# Skip specific hook
SKIP=gitleaks git commit
```

## Troubleshooting

### Common Issues

1. **Go tools not found:**
   ```bash
   # Ensure Go tools are in PATH
   export PATH=$PATH:$(go env GOPATH)/bin
   ```

2. **Node.js dependencies missing:**
   ```bash
   npm install
   ```

3. **Pre-commit not installed:**
   ```bash
   pip install pre-commit
   # or
   brew install pre-commit
   ```

4. **Hooks not running:**
   ```bash
   # Reinstall hooks
   pre-commit uninstall
   pre-commit install
   ```

### Performance Tips

- Hooks only run on modified files (except for some global checks)
- Use `pre-commit run --all-files` sparingly
- Consider using `--hook-stage manual` for expensive checks

### Updating Hooks

```bash
# Update to latest versions
pre-commit autoupdate

# Update specific hook
pre-commit autoupdate --repo https://github.com/golangci/golangci-lint
```

## Commit Message Format

The project uses conventional commit format:

```
<type>(<scope>): <subject>

<body>

<footer>
```

**Types:**
- `feat`: New feature
- `fix`: Bug fix
- `docs`: Documentation changes
- `style`: Code style changes
- `refactor`: Code refactoring
- `perf`: Performance improvements
- `test`: Test changes
- `build`: Build system changes
- `ci`: CI configuration changes
- `chore`: Other changes

**Examples:**
```bash
git commit -m "feat(api): add customer search endpoint"
git commit -m "fix(ui): resolve button alignment issue"
git commit -m "docs: update API documentation"
```

## IDE Integration

### VS Code
Install the "Pre-commit" extension for better integration.

### GoLand/IntelliJ
Configure external tools to run pre-commit hooks.

### Vim/Neovim
Use plugins like `vim-pre-commit` for integration.

## Continuous Integration

The same checks run in CI/CD pipelines to ensure consistency between local development and production deployments.

## Getting Help

If you encounter issues with pre-commit hooks:

1. Check this documentation
2. Run `./scripts/setup-pre-commit.sh` to reset configuration
3. Check individual tool documentation:
   - [pre-commit](https://pre-commit.com/)
   - [golangci-lint](https://golangci-lint.run/)
   - [gitleaks](https://github.com/gitleaks/gitleaks)
4. Ask the team for help

## Benefits

- **Consistent code quality** across all contributors
- **Early bug detection** before code review
- **Security protection** against credential leaks
- **Automated formatting** reduces style discussions
- **Faster code reviews** with pre-validated code
- **Reduced CI failures** by catching issues locally