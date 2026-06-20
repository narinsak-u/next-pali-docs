import { describe, it, expect } from "vitest";
import { PALI_EXPERT_SYSTEM_PROMPT } from "./pali-system-prompt";

describe("pali-system-prompt", () => {
  it("declares the model a Pali language expert", () => {
    expect(PALI_EXPERT_SYSTEM_PROMPT.toLowerCase()).toContain("pali");
  });

  it("instructs concise but flexible responses (no hard 100-word cap)", () => {
    expect(PALI_EXPERT_SYSTEM_PROMPT).not.toMatch(/never exceed 100 words/i);
    expect(PALI_EXPERT_SYSTEM_PROMPT.toLowerCase()).toMatch(/concise|brief|short/);
  });

  it("instructs the model to call searchDocs for textbook questions", () => {
    expect(PALI_EXPERT_SYSTEM_PROMPT.toLowerCase()).toContain("searchdocs");
  });

  it("handles the case where context is empty (no docs found)", () => {
    expect(PALI_EXPERT_SYSTEM_PROMPT.toLowerCase()).toMatch(/no context|outside the scope|kindly indicate/);
  });
});
