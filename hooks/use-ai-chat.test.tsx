import { describe, it, expect, vi } from "vitest";
import { renderHook, act } from "@testing-library/react";

vi.mock("@ai-sdk/react", () => ({
  useChat: vi.fn(),
}));
vi.mock("ai", () => ({
  DefaultChatTransport: vi.fn(),
}));

import { useChat } from "@ai-sdk/react";
import { useAIChat } from "./use-ai-chat";

function setup(overrides: Partial<{
  messages: unknown[];
  status: "ready" | "streaming" | "submitted" | "error";
  error: Error | null;
}> = {}) {
  const sendMessage = vi.fn();
  const regenerate = vi.fn();
  const stop = vi.fn();
  const setMessages = vi.fn();
  (useChat as unknown as ReturnType<typeof vi.fn>).mockClear();
  (useChat as unknown as ReturnType<typeof vi.fn>).mockReturnValue({
    messages: overrides.messages ?? [],
    status: overrides.status ?? "ready",
    sendMessage,
    regenerate,
    stop,
    setMessages,
  });
  return { sendMessage, regenerate, stop, setMessages };
}

describe("useAIChat", () => {
  it("returns messages, status, sendMessage, regenerate, stop, clear", () => {
    setup();
    const { result } = renderHook(() => useAIChat());
    expect(result.current.messages).toEqual([]);
    expect(result.current.status).toBe("ready");
    expect(typeof result.current.sendMessage).toBe("function");
    expect(typeof result.current.regenerate).toBe("function");
    expect(typeof result.current.stop).toBe("function");
    expect(typeof result.current.clear).toBe("function");
    expect(result.current.error).toBeNull();
  });

  it("clear() calls setMessages with []", () => {
    const { setMessages } = setup();
    const { result } = renderHook(() => useAIChat());
    act(() => result.current.clear());
    expect(setMessages).toHaveBeenCalledWith([]);
  });

  it("maps a quota error from useChat onError to the Thai quota message", () => {
    setup();
    const { result } = renderHook(() => useAIChat());
    act(() => {
      result.current.sendMessage({ text: "x" } as never);
    });
    const onError = (useChat as unknown as ReturnType<typeof vi.fn>).mock.calls[0]?.[0]?.onError;
    expect(typeof onError).toBe("function");
    act(() => onError?.(new Error("429 quota exceeded")));
    expect(result.current.error).toMatch(/โควต้า/);
  });

  it("maps a generic error to the generic Thai message", () => {
    setup();
    const { result } = renderHook(() => useAIChat());
    act(() => {
      result.current.sendMessage({ text: "x" } as never);
    });
    const onError = (useChat as unknown as ReturnType<typeof vi.fn>).mock.calls[0]?.[0]?.onError;
    act(() => onError?.(new Error("network down")));
    expect(result.current.error).toMatch(/เกิดข้อผิดพลาด/);
  });
});
