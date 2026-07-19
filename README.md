# Ranjirams Hotel Management System

## Overview

Ranjirams Hotel Management System is a production-oriented hotel employee attendance and payroll management system.

The software is being developed to solve:

- Biometric attendance
- Correct night-shift processing
- Shift management
- Employee management
- Salary calculation
- Advance-payment tracking

## Current Status

Phase 1 — Project Foundation

Completed so far:

- pnpm monorepo setup
- Next.js frontend setup
- Initial responsive foundation page
- Production-oriented repository structure

Not implemented yet:

- Express API
- PostgreSQL schema
- Authentication
- Employee management
- Shift management
- Attendance engine
- Salary calculation
- Advance-payment module

## Planned Client Modules

1. Employee Management
2. Shift Management
3. Attendance Management
4. Salary Calculation
5. Advance Payments

## Technology Stack

- Frontend: Next.js
- Backend: Node.js and Express
- Database: PostgreSQL
- Biometric Device: eSSL MB160 using ADMS
- Process Management: PM2
- Reverse Proxy: Nginx
- Hosting: OVH VPS
- Package Manager: pnpm

## Planned Production Architecture

Browser
→ Nginx 80/443
→ hotel-web
→ Next.js frontend

eSSL MB160
→ ADMS push
→ dedicated external hotel ADMS port
→ Nginx
→ hotel-api
→ Express attendance engine
→ PostgreSQL hotel_management database

Planned internal services:

- hotel-web
- hotel-api

These services are planned only and are not yet deployed.

## Project Isolation

This project must remain completely isolated from:

- srcheckin.com — Hostel production system
- mansion.srcheckin.com — Mansion/PG production system

Never share:

- Database
- Environment files
- PM2 processes
- Ports
- Nginx configuration
- ADMS routes
- Cron jobs
- Logs
- Backups

## Repository Structure

```text
apps/
  web/
  api/

packages/
  contracts/

docs/
  architecture/
  api/
  database/
  client-rules/
  deployment/

infrastructure/
  nginx/
  pm2/
  backup/
  scripts/
  monitoring/
```

## Local Prerequisites

- Node.js 24 or compatible supported version
- Corepack
- pnpm 11
- PostgreSQL client/server for later backend work
- Git

## Local Installation

```bash
git clone https://github.com/TheepanURK24CS1099/ranjiramshotelproj.git
cd ranjiramshotelproj
corepack enable
corepack pnpm install
```

## Running the Frontend

```bash
corepack pnpm --filter @hotel/web dev
```

Local URL:

http://localhost:3020

## Available Root Commands

- dev:web
- build:web
- build
- lint
- typecheck
- test

## Development Workflow

1. Pull latest main
2. Work on a feature branch
3. Validate changes
4. Commit only intended files
5. Push the branch
6. Create a Pull Request
7. Review and merge into main

## Security Rules

- Never commit .env files
- Never commit passwords, tokens, database credentials or device secrets
- Never commit database dumps or production backups
- Do not expose Express directly unless intentionally configured
- Keep production services isolated
- Review staged files before every commit

## Development Phases

Phase 1:

- Foundation
- Authentication
- Dashboard
- Employee Management
- Shift Management

Phase 2:

- ADMS endpoints
- Device receiver
- Attendance engine
- Duplicate protection
- Working-hour calculation

Phase 3:

- Configurable attendance rules
- Late arrival
- Early exit
- Night shifts
- Holidays
- Weekly offs

Phase 4:

- Salary engine
- Advance payments
- Payroll history

Phase 5:

- Reports
- PDF
- Excel
- WhatsApp summaries

Phase 6:

- Production deployment
- PM2
- Nginx
- SSL
- Backups
- Logging
- Monitoring

## Contributors

- Theepan — Project Owner and Developer
- Sampritha — Developer

## License

Copyright © 2026. All rights reserved.

This is a private commercial project.