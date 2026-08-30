# Contributing to a2ui-warm-paper

Thank you for your interest in contributing to `a2ui-warm-paper`. Nymrel maintains this project; JalenBuilds LLC is retained only as the legal entity for licensing and security contact purposes.

## Design & Engineering Principles

1. **The Warm Paper Aesthetic**: All components adhere to the Warm Paper palette:
   - Warm Cream: `#FAF8F2`
   - Warm Paper: `#F4F0E6`
   - Cedar Green: `#2A332E`
   - Terracotta: `#A8541F`
   - Stone Border: `#E2DDD2`
   - Dark mode is **NOT required** or forced.
2. **Dual-Audience Rule**: Components must deliver stunning visual ergonomics for humans AND verifiable, deterministic JSON schemas for autonomous AI agents.
3. **Zero Heavy Dependencies**: Avoid bloated UI libraries. All CSS is self-contained in `src/styles/warm-paper.css`.
4. **Truthful Compatibility**: Treat the current payload model as A2UI-inspired until conformance is backed by an upstream schema fixture suite.

## Development Setup

```bash
# Clone the repository
git clone https://github.com/nymrel/a2ui-warm-paper.git
cd a2ui-warm-paper

# Install dependencies
npm ci

# Run automated tests
npm test

# Run TypeScript typecheck
npm run typecheck
```

## Pull Request Guidelines

- Ensure `npm test` and `npm run typecheck` pass.
- Include unit tests for any new parser rules, component prop additions, or delta patch operators.
- Update documentation and `llms.txt` if schema definitions are expanded.
