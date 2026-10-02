// @vitest-environment jsdom
import React from "react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NumberValue } from "./NumberValue";

const preference = vi.hoisted(() => ({ numberFormat: "compact" }));
vi.mock("@/components/appearance/AppearanceProvider", () => ({ useAppearance: () => preference }));
beforeEach(() => {
  preference.numberFormat = "compact";
  vi.stubGlobal("ResizeObserver", class { observe = vi.fn(); unobserve = vi.fn(); disconnect = vi.fn(); });
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe("exact inspection of shortened amounts", () => {
  it("keeps the exact value open after click instead of Radix's default dismissal", async () => {
    render(React.createElement(NumberValue, { value: "120098942437500", unit: "BC" }));
    fireEvent.click(screen.getByRole("button", { name: "120.1t BC. Show exact value" }));
    await waitFor(() => expect(screen.getByRole("tooltip").textContent).toContain("120,098,942,437,500 BC"));
    fireEvent.keyDown(document, { key: "Escape" });
    await waitFor(() => expect(screen.queryByRole("tooltip")).toBeNull());
  });
  it("preserves every digit when exact format wraps between thousands groups", () => {
    preference.numberFormat = "exact";
    const { container } = render(React.createElement(NumberValue, { value: "9007199254740993", unit: "BC" }));
    expect(container.textContent).toBe("9,007,199,254,740,993 BC");
    expect(container.querySelectorAll("wbr").length).toBe(5);
    expect(screen.queryByRole("button")).toBeNull();
  });
  it("allows a compact value in an existing link without nesting a button", () => {
    const { container } = render(React.createElement(NumberValue, { value: "120098942437500", unit: "BC", interactive: false }));
    expect(container.textContent).toBe("120.1t BC");
    expect(container.firstElementChild?.getAttribute("aria-label")).toBe("120,098,942,437,500 BC");
    expect(screen.queryByRole("button")).toBeNull();
  });
});
