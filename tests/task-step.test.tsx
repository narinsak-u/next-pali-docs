import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { TaskStep } from "@/components/ai/task-step";

describe("TaskStep", () => {
  it("shows the query when status is running", () => {
    render(<TaskStep label="ค้นหาเอกสาร" status="running" query="dhamma" />);
    expect(screen.getByText(/dhamma/)).toBeInTheDocument();
    expect(screen.getByText(/กำลังค้นหา/)).toBeInTheDocument();
  });

  it("shows match count when status is done", () => {
    render(<TaskStep label="ค้นหาเอกสาร" status="done" matchCount={3} />);
    expect(screen.getByText(/3/)).toBeInTheDocument();
  });

  it("shows the error message when status is error", () => {
    render(<TaskStep label="ค้นหาเอกสาร" status="error" message="Pinecone timeout" />);
    expect(screen.getByText(/Pinecone timeout/)).toBeInTheDocument();
  });

  it("renders a pending state with no extra info", () => {
    render(<TaskStep label="ค้นหาเอกสาร" status="pending" />);
    expect(screen.getByText(/ค้นหาเอกสาร/)).toBeInTheDocument();
  });
});
