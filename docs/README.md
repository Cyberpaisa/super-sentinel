# Enigma Documentation

> **Discovery, Verification, and Trust Scoring Platform for Autonomous Agents on Avalanche**

## Quick Links

- 🌐 [Project Overview](./context/overview.md)
- 🏗️ [Architecture](./architecture/overview.md)
- 🎨 [Design System](./design/overview.md)
- 📡 [API Reference](./api/endpoints.md)
- 🗺️ [Roadmap](./business/roadmap.md)

---

## Documentation Index

### 📋 Context
- [Project Overview](./context/overview.md) - What is Enigma, problem & solution
- [Vision & Features](./context/vision.md) - Technical context and feature roadmap

### 🏗️ Architecture
- [System Overview](./architecture/overview.md) - High-level architecture diagram
- [Folder Structure](./architecture/folder-structure.md) - Project directory layout
- [Data Flows](./architecture/data-flows.md) - How data moves through the system
- [Tech Stack](./architecture/tech-stack.md) - Technologies and dependencies

### 💾 Backend
- [Database Schema](./backend/database.md) - Prisma models and queries
- [Authentication](./backend/authentication.md) - Wallet-based auth

### ⛓️ Blockchain
- [Blockchain Integration](./blockchain/overview.md) - Avalanche, viem, proxy detection

### 🎨 Design
- [Design System](./design/overview.md) - Colors, CSS variables
- [Components](./design/components.md) - UI component styles
- [Typography](./design/typography.md) - Fonts and type scale
- [Animations](./design/animations.md) - Effects, transitions, keyframes

### 📡 API
- [API Endpoints](./api/endpoints.md) - REST API reference

### 📐 Standards
- [Code Style](./standards/code-style.md) - TypeScript, React, Tailwind rules
- [Naming Conventions](./standards/naming-conventions.md) - Variables, files, branches
- [Error Handling](./standards/error-handling.md) - Error classes and patterns

### 💼 Business
- [Development Roadmap](./business/roadmap.md) - Phases and milestones
- [Issues by Phase](./business/issues.md) - Detailed issue definitions for each phase

### ⭐ Features
- [Trust Score](./features/trust-score.md) - Scoring formula and components
- [Scanner](./features/scanner.md) - Directory page specification

### 🧪 Testing
- [Testing Overview](./testing/overview.md) - Test strategy and examples

### 🚀 Deployment
- [Deployment Guide](./deployment/overview.md) - CI/CD, Vercel, Supabase

### 💸 x402 Protocol
- [Transaction Report](./x402/X402-TRANSACTION-REPORT.md) - First mainnet x402 payment between ERC-8004 agents
- [Best Practices](./x402/X402-BEST-PRACTICES.md) - Integration guide, headers, facilitator format, error handling

### 📚 Reference
- [Technical Glossary](./reference/glossary.md) - Terms and definitions
- [Useful Commands](./reference/commands.md) - CLI commands and links

---

## Getting Started

```bash
# Clone repository
git clone https://github.com/your-org/enigma.git

# Install dependencies
cd enigma
npm install

# Setup environment
cp .env.example .env.local
# Edit .env.local with your keys

# Run database migrations
npx prisma migrate dev

# Start development server
npm run dev
```

## Key Concepts

| Concept | Description |
|---------|-------------|
| **Trust Score** | Composite 0-100 rating based on volume, uptime, proxy detection, OZ match, and ratings |
| **Centinela** | Verification engine that analyzes agents for proxies and performs heartbeat checks |
| **ERC-804** | Standard for autonomous agents on blockchain |
| **Glassmorphism** | Design pattern with blur, transparency, and subtle borders |

## Contributing

1. Read the [Code Standards](./standards/code-style.md)
2. Follow [Naming Conventions](./standards/naming-conventions.md)
3. Use Conventional Commits for git messages
4. Open a PR against `develop` branch

---

**Version**: 1.0.0
**Status**: Pre-Development
**Blockchain**: Avalanche C-Chain
