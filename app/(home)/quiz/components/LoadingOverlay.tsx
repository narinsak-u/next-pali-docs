"use client";

import { Button } from "@/components/ui/button";
import { AlertCircle, Loader2, RefreshCw, Search, FileQuestion } from "lucide-react";
import { CheckCircle } from "lucide-react";

interface LoadingOverlayProps {
  error?: string | null;
  onRetry?: () => void;
  phase?: "searching" | "generating" | "idle";
  matchCount?: number;
}

export function LoadingOverlay({
  error,
  onRetry,
  phase = "searching",
  matchCount = 0,
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
      <div className="w-full max-w-lg space-y-6 p-2 text-center">
        {phase === "searching" && (
          <>
            <Search className="size-10 mx-auto text-primary animate-pulse" />
            <h2 className="text-2xl font-bold">กำลังค้นหาเนื้อหา...</h2>
            <p className="text-muted-foreground">
              กำลังสืบค้นข้อมูลจากคลังตำราเรียนภาษาบาลี
            </p>
            <Loader2 className="size-8 mx-auto animate-spin text-primary" />
          </>
        )}

        {phase === "generating" && (
          <>
            <FileQuestion className="size-10 mx-auto text-primary" />
            <h2 className="text-2xl font-bold">AI กำลังสร้างแบบทดสอบ</h2>
            <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
              <CheckCircle className="size-4 text-green-500" />
              <span>ค้นพบเอกสารที่เกี่ยวข้อง {matchCount} รายการ</span>
            </div>
            <p className="text-muted-foreground">
              กำลังสร้างคำถามที่คัดสรรมาอย่างดีตามเนื้อหาที่ค้นพบ...
            </p>
            <Loader2 className="size-8 mx-auto animate-spin text-primary" />
          </>
        )}
      </div>
    </div>
  );
}
