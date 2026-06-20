export function ReasoningStep({ summary }: { summary: string }) {
  return (
    <div
      data-testid="reasoning-step"
      className="rounded-md border border-purple-300 bg-purple-50 dark:bg-purple-950/40 dark:border-purple-800 px-3 py-2 text-sm text-purple-900 dark:text-purple-200"
    >
      <span className="font-semibold mr-2">Reasoning:</span>
      {summary}
    </div>
  );
}
