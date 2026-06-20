import { describe, it, expect, vi } from "vitest";
import { generateSuggestions } from "@/lib/services/suggestions";
import { generateText, Output } from "ai";

vi.mock("ai", async (importOriginal) => {
  const actual = await importOriginal<typeof import("ai")>();
  return {
    ...actual,
    generateText: vi.fn(),
    Output: {
      ...actual.Output,
      object: ({ schema }: { schema: { parse: (input: unknown) => unknown } }) =>
        ({ schema }) as unknown as ReturnType<typeof Output.object>,
    },
  };
});

const mockedGenerateText = vi.mocked(generateText);

describe("generateSuggestions", () => {
  it("returns 3 Thai question strings", async () => {
    mockedGenerateText.mockResolvedValue({
      experimental_output: { suggestions: ["q1", "q2", "q3"] },
    } as never);

    const result = await generateSuggestions("Dhamma is the teaching...");
    expect(result).toEqual(["q1", "q2", "q3"]);
  });

  it("passes a schema enforcing exactly 3 items", async () => {
    mockedGenerateText.mockResolvedValue({
      experimental_output: { suggestions: ["a", "b", "c"] },
    } as never);

    await generateSuggestions("answer");

    const call = mockedGenerateText.mock.calls[0]?.[0] as unknown as { experimental_output: { schema: { parse: (input: unknown) => unknown } } };
    expect(call).toBeDefined();
    const parsed = call.experimental_output.schema.parse({ suggestions: ["x", "y", "z"] });
    expect(parsed).toEqual({ suggestions: ["x", "y", "z"] });
    expect(() => call.experimental_output.schema.parse({ suggestions: ["x", "y"] })).toThrow();
    expect(() => call.experimental_output.schema.parse({ suggestions: ["x", "y", "z", "w"] })).toThrow();
  });

  it("propagates generateText errors", async () => {
    mockedGenerateText.mockRejectedValue(new Error("rate limit"));
    await expect(generateSuggestions("answer")).rejects.toThrow("rate limit");
  });
});
