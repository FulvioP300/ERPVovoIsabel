import { useMutation } from "@tanstack/react-query";
import { aiIntakeService } from "../services/ai-intake.service";

/** Estados `loading/success/error` nativos do TanStack Query (`isPending`/`isSuccess`/
 * `isError`); `empty` é o estado inicial antes de qualquer análise (`isIdle`) — spec 006,
 * seção 7. */
export function useAiAnalysis() {
  return useMutation({
    mutationFn: ({ prompt, images }: { prompt: string; images: File[] }) => aiIntakeService.analyze(prompt, images),
  });
}
