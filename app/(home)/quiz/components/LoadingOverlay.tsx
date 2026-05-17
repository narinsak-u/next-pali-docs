"use client";

import { useEffect, useState } from "react";
import { Progress } from "@/components/ui/progress";
import { Button } from "@/components/ui/button";
import { AlertCircle, RefreshCw } from "lucide-react";

interface LoadingOverlayProps {
  duration?: number;
  onComplete: () => void;
  error?: string | null;
  onRetry?: () => void;
}

export function LoadingOverlay({
  duration = 15,
  onComplete,
  error,
  onRetry,
}: LoadingOverlayProps) {
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    if (error) return;
    const interval = setInterval(() => {
      setProgress((prev) => {
        const newProgress = prev + 100 / (duration * 10);
        return Math.min(newProgress, 100);
      });
    }, 100);

    return () => clearInterval(interval);
  }, [duration, error]);

  useEffect(() => {
    if (progress >= 100 && !error) {
      onComplete();
    }
  }, [progress, onComplete, error]);

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
        <Progress value={progress} className="h-2 w-full" />
        <p className="text-sm text-muted-foreground">{Math.round(progress)}%</p>
      </div>
    </div>
  );
}
