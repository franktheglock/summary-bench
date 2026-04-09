import { z } from "zod";

export const benchmarkUploadSchema = z.object({
  benchmark_version: z.string(),
  run_id: z.string().uuid(),
  model: z.string(),
  provider: z.string(),
  timestamp: z.string(),
  config: z.any(),
  results: z.array(
    z.object({
      test_id: z.string(),
      category: z.string(),
      summary: z.string(),
      input_tokens: z.number().optional(),
      output_tokens: z.number().optional(),
      latency_ms: z.number().optional(),
    })
  ),
});

export type BenchmarkUpload = z.infer<typeof benchmarkUploadSchema>;
