# SkillForge AI — developer shortcuts.
# Run `make help` for the list.

.DEFAULT_GOAL := help
.PHONY: help up down status install db-migrate db-seed db-reset dev build test lint typecheck fmt tenant-check security-audit ci

help:  ## Show this help
	@awk 'BEGIN {FS = ":.*##"; printf "\nUsage: make \033[36m<target>\033[0m\n"} /^[a-zA-Z_-]+:.*?##/ { printf "  \033[36m%-18s\033[0m %s\n", $$1, $$2 }' $(MAKEFILE_LIST)

up:  ## Start Postgres + Redis locally via Homebrew
	@./tools/local-up.sh

down:  ## Stop Postgres + Redis
	@./tools/local-down.sh

status:  ## Show local infra + service status
	@./tools/local-status.sh

install:  ## Install workspace deps with pnpm
	@pnpm install

db-migrate:  ## Run pending Prisma migrations (dev mode)
	@pnpm db:migrate:dev

db-seed:  ## Seed Qualtech tenant + test users
	@pnpm db:seed

db-reset:  ## Drop + recreate DB (destructive)
	@pnpm db:reset

dev:  ## Start all apps + services in parallel
	@pnpm dev

build:  ## Build all workspaces via Turborepo
	@pnpm build

test:  ## Run all tests
	@pnpm test

lint:  ## Lint all workspaces
	@pnpm lint

typecheck:  ## Typecheck all workspaces
	@pnpm typecheck

fmt:  ## Format code with Prettier
	@pnpm format

tenant-check:  ## Scan for missing org_id filters (sf-tenant-check skill)
	@pnpm tenant:check

security-audit:  ## Run security audits (pnpm audit + semgrep)
	@pnpm security:audit

ci:  ## Run what CI runs (lint + typecheck + test + build)
	@pnpm lint && pnpm typecheck && pnpm test && pnpm build
