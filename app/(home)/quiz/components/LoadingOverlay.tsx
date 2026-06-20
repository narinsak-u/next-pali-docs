"use client";

import { Button } from "@/components/ui/button";
import { AlertCircle, Loader2, RefreshCw } from "lucide-react";

interface LoadingOverlayProps {
  error?: string | null;
  onRetry?: () => void;
}

export function LoadingOverlay({
  error,
  onRetry,
}: LoadingOverlayProps) {
  if (error) {
    return (
      <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-background/80 backdrop-blur-sm">
        <div className="w-full max-w-lg space-y-4 p-6 text-center">
          <AlertCircle className="size-12 mx-auto text-red-500" />
          <h2 className="text-2xl font-bold text-red-600">เกิดข้อผิดพลาด</h2>
          <p className="text-muted-foreground">{error}</p>
          {onRetry && (
            <Button onClick={onRetry} variant="outline" className="gap-2">
              <RefreshCw className="size-4" />
              ลองอีกครั้ง
            </Button>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-background/80 backdrop-blur-sm">
      <div className="w-full max-w-lg space-y-4 p-2 text-center">
        <h2 className="text-2xl font-bold">AI กำลังสร้างแบบทดสอบ</h2>
        <p className="text-muted-foreground">
          เตรียมพร้อมสำหรับคำถามที่คัดสรรมาอย่างดี และความท้าทายที่รอคุณอยู่...
        </p>
        <Loader2 className="size-8 mx-auto animate-spin text-primary" />
      </div>
    </div>
  );
}
