---
sidebar_position: 7
---

# Web UI Testing

The Web UI uses Vitest with Testing Library for unit and component tests.

## Test Setup

```typescript
// src/test/setup.ts
import "@testing-library/jest-dom";
```

## Running Tests

```bash
cd mcp-webui
npm test              # Run once
npm run test:watch    # Watch mode
```

## API Tests

```typescript
// src/__tests__/api.test.ts
import { describe, it, expect } from "vitest";

describe("API client", () => {
  it("should build correct URLs", () => {
    expect(getConfigUrl("ubuntu-server")).toBe("/api/config/ubuntu-server");
  });
});
```

## Writing Component Tests

```typescript
import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import Toggle from "@/components/Toggle";

describe("Toggle", () => {
  it("renders with correct label", () => {
    render(<Toggle checked={true} onChange={() => {}} label="Enable" />);
    expect(screen.getByText("Enable")).toBeInTheDocument();
  });
});
```

## CI

Tests run in CI via `npm test`. The CI also runs `npm run typecheck` and `npm run build` to verify the full production build.
