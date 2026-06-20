import { describe, it, expect } from "vitest";
import {
  reasoningPartSchema,
  taskPartSchema,
  suggestionsPartSchema,
  taskStatusSchema,
} from "@/lib/schemas/ai-data-parts";

describe("ai-data-parts", () => {
  it("accepts a valid reasoning part", () => {
    expect(reasoningPartSchema.parse({ summary: "พบเอกสาร 3 รายการ" })).toEqual({
      summary: "พบเอกสาร 3 รายการ",
    });
  });

  it("rejects an empty reasoning summary", () => {
    expect(() => reasoningPartSchema.parse({ summary: "" })).toThrow();
  });

  it("accepts a running task part", () => {
    expect(
      taskPartSchema.parse({
        label: "ค้นหาเอกสาร",
        status: "running",
        query: "dhamma",
      }),
    ).toEqual({ label: "ค้นหาเอกสาร", status: "running", query: "dhamma" });
  });

  it("accepts a done task part with matchCount", () => {
    expect(
      taskPartSchema.parse({
        label: "ค้นหาเอกสาร",
        status: "done",
        matchCount: 3,
      }),
    ).toEqual({ label: "ค้นหาเอกสาร", status: "done", matchCount: 3 });
  });

  it("accepts a task part with id", () => {
    expect(
      taskPartSchema.parse({
        id: "tc-1",
        label: "ค้นหาเอกสาร",
        status: "done",
        matchCount: 3,
      }),
    ).toEqual({
      id: "tc-1",
      label: "ค้นหาเอกสาร",
      status: "done",
      matchCount: 3,
    });
  });

  it("accepts an error task part with message", () => {
    expect(
      taskPartSchema.parse({
        label: "ค้นหาเอกสาร",
        status: "error",
        message: "Pinecone timeout",
      }),
    ).toEqual({ label: "ค้นหาเอกสาร", status: "error", message: "Pinecone timeout" });
  });

  it("rejects an unknown task status", () => {
    expect(() => taskStatusSchema.parse("paused")).toThrow();
  });

  it("accepts exactly 3 suggestions", () => {
    expect(
      suggestionsPartSchema.parse({
        suggestions: ["q1", "q2", "q3"],
      }),
    ).toEqual({ suggestions: ["q1", "q2", "q3"] });
  });

  it("rejects more or fewer than 3 suggestions", () => {
    expect(() => suggestionsPartSchema.parse({ suggestions: ["q1", "q2"] })).toThrow();
    expect(() =>
      suggestionsPartSchema.parse({ suggestions: ["q1", "q2", "q3", "q4"] }),
    ).toThrow();
  });
});
