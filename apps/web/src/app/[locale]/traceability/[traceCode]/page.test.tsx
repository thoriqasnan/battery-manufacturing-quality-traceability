import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import TraceabilityUnitPage from "./page";

vi.mock("@/components/auth/auth-gateway", () => ({
  AuthGateway: () => <main>Authenticated traceability unit detail route</main>,
}));

describe("traceability unit detail route", () => {
  it("resolves through the authenticated application gateway", () => {
    render(<TraceabilityUnitPage />);
    expect(screen.getByRole("main")).toHaveTextContent("Authenticated traceability unit detail route");
  });
});
