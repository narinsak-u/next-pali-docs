import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/services/quiz-pipeline", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/services/quiz-pipeline")>();
  return {
    ...actual,
    generateQuizStream: vi.fn(),
  };
});

import { POST } from "@/app/api/quiz/route";
import { generateQuizStream } from "@/lib/services/quiz-pipeline";

const mockedStream = vi.mocked(generateQuizStream);

beforeEach(() => {
  vi.clearAllMocks();
});

function makeReq(body: unknown): Request {
  return new Request("http://localhost/api/quiz", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

describe("POST /api/quiz", () => {
  it("returns 200 with SSE stream on success", async () => {
    const fakeStream = new ReadableStream({ start(ctrl) { ctrl.close(); } });
    mockedStream.mockResolvedValue(fakeStream);

    const response = await POST(makeReq({ topics: ["anatta"], amount: 3 }));

    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toBe("text/event-stream");
    expect(mockedStream).toHaveBeenCalledWith({ topics: ["anatta"], amount: 3 });
  });

  it("returns 500 for invalid input", async () => {
    const response = await POST(makeReq({ topics: "not-an-array" }));

    expect(response.status).toBe(500);
    const body = await response.json();
    expect(body.error).toBe("เกิดข้อผิดพลาดในการสร้างแบบทดสอบ กรุณาลองใหม่อีกครั้ง");
  });

  it("returns 429 for quota errors", async () => {
    mockedStream.mockRejectedValue(new Error("quota exceeded"));

    const response = await POST(makeReq({ topics: ["anatta"], amount: 3 }));

    expect(response.status).toBe(429);
    const body = await response.json();
    expect(body.error).toContain("โควต้า");
  });

  it("returns 429 for 429 errors", async () => {
    mockedStream.mockRejectedValue(new Error("429 Too Many Requests"));

    const response = await POST(makeReq({ topics: ["anatta"], amount: 3 }));

    expect(response.status).toBe(429);
  });

  it("returns 500 for non-quota pipeline errors", async () => {
    mockedStream.mockRejectedValue(new Error("Pinecone connection failed"));

    const response = await POST(makeReq({ topics: ["anatta"], amount: 3 }));

    expect(response.status).toBe(500);
  });
});
