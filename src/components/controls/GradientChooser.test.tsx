// @vitest-environment jsdom

import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { GradientChooser } from "./GradientChooser";

describe("GradientChooser", () => {
  it("adds a stop in the widest gap and publishes normalized stops", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    document.addEventListener("gradientchange", onChange);
    render(<GradientChooser />);

    await user.click(screen.getByRole("button", { name: /add colour stop/i }));

    expect(screen.getAllByRole("button", { name: /remove stop/i })).toHaveLength(7);
    await waitFor(() => {
      const event = onChange.mock.calls.at(-1)?.[0] as CustomEvent;
      expect(event.detail.stops).toContainEqual({ position: 0.7, color: "#06b6d4" });
    });
    document.removeEventListener("gradientchange", onChange);
  });

  it("switches presets and restores externally supplied parameters", async () => {
    const user = userEvent.setup();
    render(<GradientChooser />);

    await user.click(screen.getByRole("button", { name: "Ocean" }));
    expect(screen.getByRole("button", { name: "Ocean" })).toHaveClass("active");
    expect(screen.getAllByRole("button", { name: /remove stop/i })).toHaveLength(3);

    document.dispatchEvent(new CustomEvent("restoreparameters", {
      detail: { gradientStops: [{ position: 0, color: "#000000" }, { position: 1, color: "#ffffff" }] },
    }));

    await waitFor(() => expect(screen.getAllByRole("button", { name: /remove stop/i })).toHaveLength(2));
    expect(screen.getAllByRole("button", { name: /remove stop/i })[0]).toBeDisabled();
  });
});
