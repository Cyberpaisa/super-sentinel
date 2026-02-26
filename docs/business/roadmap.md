# Development Roadmap

## Timeline

```mermaid
gantt
    title Super Sentinel MVP Roadmap
    dateFormat YYYY-MM-DD
    axisFormat %b %d

    section Infrastructure
    Phase 0 - Setup & Infra           :done, p0, 2025-01-01, 3d
    Phase 1 - Auth & Backend Core     :done, p1, after p0, 4d

    section Core Features
    Phase 2 - Agent Registration      :done, p2, after p1, 5d
    Phase 3 - Scanner / Directory     :done, p3, after p2, 6d
    Phase 4 - Centinela Verification  :done, p4, after p3, 7d
    Phase 5 - Trust Score System      :done, p5, after p4, 4d

    section UI & Feedback
    Phase 6 - Agent Profile           :done, p6, after p5, 5d
    Phase 7 - Feedback System         :done, p7, after p6, 4d

    section Launch
    Phase 8 - Polish & Testing        :done, p8, after p7, 4d
    Phase 9 - Deploy & Launch         :done, p9, after p8, 3d
```

## Phase Dependencies

```mermaid
flowchart LR
    P0[Phase 0<br/>Setup] --> P1[Phase 1<br/>Auth & API]
    P1 --> P2[Phase 2<br/>Registration]
    P2 --> P3[Phase 3<br/>Scanner]
    P2 --> P4[Phase 4<br/>Centinela]
    P4 --> P5[Phase 5<br/>Trust Score]
    P3 --> P6[Phase 6<br/>Agent Profile]
    P5 --> P6
    P6 --> P7[Phase 7<br/>Feedback]
    P7 --> P8[Phase 8<br/>Polish & QA]
    P8 --> P9[Phase 9<br/>Deploy]
```

## Phase Details

### Phase 0: Setup & Infrastructure (2-3 days)

- Initialize Next.js 14 project with TypeScript
- Configure TailwindCSS and shadcn/ui
- Setup Supabase project + Prisma ORM
- Configure ESLint, Prettier, Husky
- Setup Pino logging

### Phase 1: Auth & Backend Core (3-4 days)

- Configure wagmi and viem
- Create WalletConnectButton component
- Build Header with wallet connection
- Create health check API route
- Build API helper utilities + custom error classes
- Setup rate limiting middleware

### Phase 2: Agent Registration (4-5 days)

- Define Prisma Agent model
- Create Zod validation schemas
- Setup viem client and ERC-804 ABI
- Build blockchain service + agent service (CRUD)
- Implement POST /agents/register API
- Build registration page frontend

### Phase 3: Scanner / Directory (5-6 days)

- Implement GET /agents API with filtering
- Create useAgents hook
- Build AgentTable (TanStack Table) + AgentCard
- Create Filters component + SearchBar with autocomplete
- Build Scanner page layout with KPI cards

### Phase 4: Centinela Verification (5-7 days)

- Build proxy detection service (EIP-1967 analysis)
- Create heartbeat service (contract pings)
- Build OpenZeppelin bytecode matcher
- Create indexer service (Routescan API + RPC)
- Configure Vercel Cron (every 3 hours)

### Phase 5: Trust Score (3-4 days)

- Build trust score service with weighted formula
- Create trust score snapshot system
- Implement trust-score and trust-history API endpoints
- Add TrustScoreBadge + breakdown components

### Phase 6: Agent Profile (4-5 days)

- Build agent detail page with tabs (Overview, Activity, Community, Metadata)
- Create trust score breakdown visualization
- Build heartbeat timeline display
- Implement share and embed functionality

### Phase 7: Feedback System (3-4 days)

- Implement ratings API (with wallet signature verification)
- Implement reports API (with auto-flagging at 3+ reports)
- Build RatingForm component (stars + comment)
- Create ReportModal component (reason + description)

### Phase 8: Polish & Testing (3-4 days)

- Vitest unit + integration tests (80% coverage target)
- Performance optimization
- Mobile responsiveness QA
- Accessibility review
- Security review

### Phase 9: Deploy & Launch (2-3 days)

- Configure Vercel production
- Setup Supabase production database
- Configure Sentry error tracking
- Setup monitoring and alerts
- Deploy!

**Total MVP**: ~35-45 days (~7-9 weeks)
