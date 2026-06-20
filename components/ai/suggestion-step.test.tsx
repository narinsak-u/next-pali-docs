import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { SuggestionStep } from "./suggestion-step";

describe("SuggestionStep", () => {
  it("renders one chip per suggestion", () => {
    render(
      <SuggestionStep
        suggestions={["q1", "q2", "q3"]}
        onSelect={() => {}}
      />,
    );
    expect(screen.getAllByRole("button")).toHaveLength(3);
    expect(screen.getByText("q1")).toBeInTheDocument();
    expect(screen.getByText("q2")).toBeInTheDocument();
    expect(screen.getByText("q3")).toBeInTheDocument();
  });

  it("calls onSelect with the clicked suggestion text", () => {
    const onSelect = vi.fn();
    render(
      <SuggestionStep suggestions={["q1", "q2", "q3"]} onSelect={onSelect} />,
    );
    fireEvent.click(screen.getByText("q2"));
    expect(onSelect).toHaveBeenCalledWith("q2");
  });
});
