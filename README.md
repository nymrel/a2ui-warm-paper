# a2ui-warm-paper

> **Google A2UI (Agent-to-UI) declarative JSON specification component system with Nymrel's signature Warm Paper design aesthetic.**

[![Version](https://img.shields.io/badge/version-1.0.0-2A332E.svg?style=flat-square)](https://github.com/nymrel/a2ui-warm-paper)
[![License: MIT](https://img.shields.io/badge/License-MIT-A8541F.svg?style=flat-square)](https://opensource.org/licenses/MIT)
[![A2UI Spec](https://img.shields.io/badge/A2UI-v0.8%20Compliant-2E5A44.svg?style=flat-square)](https://github.com/nymrel/a2ui-warm-paper)
[![Design System](https://img.shields.io/badge/Design-Warm%20Paper-FAF8F2.svg?style=flat-square)](https://github.com/nymrel/a2ui-warm-paper)

---

## 📖 Overview

**a2ui-warm-paper** is a production-grade React & TypeScript component library implementing the **Google A2UI (Agent-to-UI) declarative JSON specification**. It turns raw JSON payloads streamed by autonomous AI agents (LLMs, reasoning models, autonomous multi-agent pipelines) into rich, interactive, human-in-the-loop user interfaces.

Built around **Nymrel's signature Warm Paper design aesthetic**, it delivers warm, tactile, editorial typography and soft linen surfaces (`#FAF8F2`, `#F4F0E6`, `#2A332E`, `#A8541F`) designed to combat dark-mode fatigue while maintaining high-contrast clarity.

---

## 🏛️ The Dual-Audience Rule

Every component in `a2ui-warm-paper` adheres to Nymrel's **Dual-Audience Contract**:
1. **Machine Trust & Determinism**: Every card is backed by a strict, validated JSON schema (A2UI v0.8) and supports stream deltas (`set`, `append`, `merge`, `delete`) with JSON-LD entity provenance (`Nymrel -> JalenBuilds LLC`).
2. **Exquisite Human Ergonomics**: Rich editorial typography, weighted choice matrices with percentage bars, clear pros/cons tradeoffs, risk-rated approval gates, and readable syntax-toned diff viewers.

```
┌─────────────────────────────────────────────────────────────┐
│                    AUTONOMOUS AI AGENT                      │
│             (GPT-5.6 / Claude / Gemini / Grok)              │
└──────────────────────────────┬──────────────────────────────┘
                               │ Streams A2UI v0.8 JSON / Deltas
                               ▼
┌─────────────────────────────────────────────────────────────┐
│                      A2UI PARSER ENGINE                     │
│    • Schema Validation       • Markdown Fence Unwrapping    │
│    • Stream Delta Patching   • Error Recovery & Sanitizing  │
└──────────────────────────────┬──────────────────────────────┘
                               │ Validated Payload Tree
                               ▼
┌─────────────────────────────────────────────────────────────┐
│              WARM PAPER COMPONENT ECOSYSTEM                 │
│  ┌─────────────────┐ ┌─────────────────┐ ┌────────────────┐ │
│  │ A2UIDecisionCard│ │A2UIApprovalGate │ │A2UIDiffViewer  │ │
│  └─────────────────┘ └─────────────────┘ └────────────────┘ │
│  ┌─────────────────┐ ┌─────────────────┐ ┌────────────────┐ │
│  │A2UIProgressTrack│ │A2UIParamSlider  │ │ A2UIDataTable  │ │
│  └─────────────────┘ └─────────────────┘ └────────────────┘ │
│  ┌────────────────────────────────────────────────────────┐ │
│  │          A2UIContainer (Root Card Wrapper)             │ │
│  └────────────────────────────────────────────────────────┘ │
└──────────────────────────────┬──────────────────────────────┘
                               │ Interactive User Action
                               ▼
┌─────────────────────────────────────────────────────────────┐
│                 HUMAN-IN-THE-LOOP FEEDBACK                  │
│       (Approve / Reject / Edit / Select / Value Change)     │
└─────────────────────────────────────────────────────────────┘
```

---

## 🎨 Warm Paper Design Tokens

| Token Name | Hex Code | Role / Usage |
| :--- | :--- | :--- |
| **Warm Cream** | `#FAF8F2` | Canvas & app background |
| **Warm Paper** | `#F4F0E6` | Primary card & component surface |
| **Soft Linen** | `#EFE9DC` | Card hover states & secondary containers |
| **Cedar Green** | `#2A332E` | Brand primary, headings, high-contrast actions |
| **Terracotta** | `#A8541F` | Focus rings, highlight badges, primary submit buttons |
| **Stone Border** | `#E2DDD2` | Subtle dividers & component borders |
| **Sage Green** | `#2E5A44` | Success status, low-risk tags, approved states |
| **Amber Gold** | `#D97706` | In-progress tasks, medium-risk warnings |
| **Rust Red** | `#991B1B` | Critical risk, rejection states, deletions |

---

## 📦 Installation

```bash
npm install a2ui-warm-paper react react-dom
```

Import the self-contained stylesheet in your root entrypoint:

```tsx
import 'a2ui-warm-paper/dist/styles/warm-paper.css';
// Or if importing from source:
import 'a2ui-warm-paper/src/styles/warm-paper.css';
```

---

## 🚀 Quick Start

### 1. Universal Polymorphic Rendering with `A2UIRenderer`

Pass any valid A2UI JSON payload (or JSON string) to `A2UIRenderer`:

```tsx
import React from 'react';
import { A2UIRenderer, A2UIActionEvent } from 'a2ui-warm-paper';
import 'a2ui-warm-paper/src/styles/warm-paper.css';

const samplePayload = {
  id: "dec-model-routing",
  type: "decision",
  question: "Select Agent Model Strategy for Refactor Lane",
  options: [
    {
      id: "opt-terra",
      title: "Option A: GPT-5.6 Terra Implementation",
      weight: 70,
      recommended: true,
      tradeoffs: {
        pros: ["Predictable token expenditure (~75k tokens)", "Zero regression risk"],
        cons: ["Requires sequential verification pass (+2m)"]
      }
    },
    {
      id: "opt-sol",
      title: "Option B: GPT-5.6 Sol Direct Architecture",
      weight: 30,
      tradeoffs: {
        pros: ["Fastest implementation"],
        cons: ["Higher token quota utilization"]
      }
    }
  ]
};

export function AgentCockpit() {
  const handleAction = (event: A2UIActionEvent) => {
    console.log("Operator action received:", event);
    // Dispatch action back to agent stream or API
  };

  return <A2UIRenderer data={samplePayload} onAction={handleAction} />;
}
```

---

## 🧩 Component Catalog & JSON Schemas

### 1. `A2UIDecisionCard`
Weighted multi-choice selection cards supporting 2–4 options, percentage bars, recommended tags, pros/cons tradeoffs, and custom user input.

```json
{
  "id": "dec-deploy-strategy",
  "type": "decision",
  "question": "Select deployment strategy for mobile release",
  "context": "Release candidate passes 100% tests on iOS simulator.",
  "confidenceScore": 0.94,
  "options": [
    {
      "id": "opt-canary",
      "title": "Canary Rollout (10% Traffic)",
      "weight": 60,
      "recommended": true,
      "tradeoffs": {
        "pros": ["Monitors real-world crash rate", "Instant auto-rollback"],
        "cons": ["Takes 24 hours to reach 100%"]
      }
    },
    {
      "id": "opt-full",
      "title": "Full Production Release",
      "weight": 35,
      "tradeoffs": {
        "pros": ["Immediate global availability"],
        "cons": ["Higher blast radius on unforeseen edge-cases"]
      }
    },
    {
      "id": "opt-hold",
      "title": "Hold Release (Do Nothing)",
      "weight": 5
    }
  ],
  "allowCustomInput": true
}
```

### 2. `A2UIApprovalGate`
Human-in-the-loop gate for critical operations with risk levels (`low`, `medium`, `high`, `critical`), confidence scores, and structured review actions.

```json
{
  "id": "appr-db-migration",
  "type": "approval_gate",
  "title": "Production Database Schema Migration",
  "description": "Agent requested permission to apply zero-downtime column migration.",
  "riskLevel": "high",
  "confidence": 0.98,
  "targetAction": "db:apply_migration_v4",
  "impactSummary": [
    "Adds 'metadata' JSONB column to 'users' table",
    "Creates non-blocking concurrently indexed B-tree",
    "Zero table locks or API downtime expected"
  ],
  "requireReasonOnReject": true
}
```

### 3. `A2UIParameterSlider`
Numeric bounds, step increments, live value readouts, quick preset pills, and danger zone threshold warnings.

```json
{
  "id": "slider-temp",
  "type": "parameter_slider",
  "label": "Model Temperature",
  "description": "Controls randomness and creativity in reasoning output.",
  "value": 0.7,
  "min": 0.0,
  "max": 2.0,
  "step": 0.1,
  "unit": "temp",
  "presets": [
    { "label": "Deterministic", "value": 0.0 },
    { "label": "Balanced", "value": 0.7 },
    { "label": "Creative", "value": 1.4 }
  ]
}
```

### 4. `A2UIDiffViewer`
Side-by-side (split) and unified code/text diff viewer with line numbers, additions/deletions highlighting, and clipboard copy.

```json
{
  "id": "diff-env-port",
  "type": "diff_viewer",
  "filename": "src/config/server.ts",
  "language": "typescript",
  "viewMode": "unified",
  "originalContent": "const PORT = 3000;\napp.listen(PORT);",
  "modifiedContent": "const PORT = process.env.PORT || 8080;\napp.listen(PORT);",
  "summary": {
    "additions": 1,
    "deletions": 1
  }
}
```

### 5. `A2UIProgressTracker`
Step-by-step lifecycle timeline with live active pulsing dots, duration metrics, sub-tasks, and error detail cards.

```json
{
  "id": "prog-build-pipeline",
  "type": "progress_tracker",
  "title": "Autonomous Modernization Pipeline",
  "currentStepId": "step-tests",
  "steps": [
    { "id": "step-lint", "title": "Static Linting & Format", "status": "completed", "durationMs": 320 },
    { "id": "step-typecheck", "title": "TypeScript Compiler", "status": "completed", "durationMs": 1450 },
    { "id": "step-tests", "title": "Unit & Integration Test Suite", "status": "running" },
    { "id": "step-deploy", "title": "Edge Worker Deployment", "status": "pending" }
  ]
}
```

### 6. `A2UIDataTable`
Structured tabular agent record display with column sorting, live substring search, row selection, pagination, and CSV export.

```json
{
  "id": "table-tasks",
  "type": "data_table",
  "title": "Active Studio Tasks",
  "searchable": true,
  "selectable": true,
  "exportable": true,
  "columns": [
    { "key": "taskId", "header": "Task ID", "type": "code", "sortable": true },
    { "key": "owner", "header": "Mission Owner", "type": "text", "sortable": true },
    { "key": "status", "header": "Status", "type": "badge", "sortable": true }
  ],
  "rows": [
    { "taskId": "TASK-104", "owner": "Sol Architect", "status": "In Progress" },
    { "taskId": "TASK-105", "owner": "Terra Worker", "status": "Completed" }
  ]
}
```

---

## ⚡ Real-Time Streaming & Hook Integration

Consume live stream chunks and patch updates dynamically using `useA2UIStream`:

```tsx
import React, { useEffect } from 'react';
import { useA2UIStream, A2UIRenderer } from 'a2ui-warm-paper';

export function LiveAgentStreamView({ sseEndpoint }: { sseEndpoint: string }) {
  const { payload, appendChunk, applyDelta } = useA2UIStream();

  useEffect(() => {
    const eventSource = new EventSource(sseEndpoint);
    
    eventSource.onmessage = (event) => {
      const data = JSON.parse(event.data);
      if (data.delta) {
        applyDelta(data.delta); // e.g. { op: 'set', path: 'steps[1].status', value: 'completed' }
      } else if (data.chunk) {
        appendChunk(data.chunk);
      }
    };

    return () => eventSource.close();
  }, [sseEndpoint, appendChunk, applyDelta]);

  if (!payload) return <div>Waiting for agent stream...</div>;

  return <A2UIRenderer data={payload} />;
}
```

---

## 🧪 Testing

The repository features an automated unit test suite built with Node.js built-in test assertions, requiring zero external binaries:

```bash
# Run unit tests
npm test

# Run TypeScript type verification
npm run typecheck
```

---

## 📄 License & Attribution

Distributed under the **MIT License**. Copyright (c) 2026 **Nymrel / JalenBuilds LLC** (`contact@nymrel.com`).
