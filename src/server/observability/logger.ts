import { prisma } from "@/server/db/prisma";
import { ClientType, DubJobStatus, SourceType } from "@/domain/models";

export interface JobObservabilityLogInput {
  jobId: string;
  userId: string;
  clientType: ClientType;
  sourceType: SourceType;
  provider: string;
  stage: string;
  durationMs: number;
  status: DubJobStatus;
  errorCode?: string | null;
  creditSpent: number;
  message: string;
  readyFromMs?: number;
  readyToMs?: number;
}

export async function recordJobObservabilityEvent(
  input: JobObservabilityLogInput
): Promise<void> {
  const structuredEntry = {
    timestamp: new Date().toISOString(),
    jobId: input.jobId,
    userId: input.userId,
    clientType: input.clientType,
    sourceType: input.sourceType,
    provider: input.provider,
    stage: input.stage,
    durationMs: input.durationMs,
    status: input.status,
    errorCode: input.errorCode ?? null,
    creditSpent: input.creditSpent,
    message: input.message,
  };

  if (process.env.NODE_ENV !== "test") {
    console.info(JSON.stringify(structuredEntry));
  }

  await prisma.jobEventLog.create({
    data: {
      jobId: input.jobId,
      userId: input.userId,
      clientType: input.clientType,
      sourceType: input.sourceType,
      provider: input.provider,
      stage: input.stage,
      durationMs: input.durationMs,
      status: input.status,
      errorCode: input.errorCode ?? null,
      creditSpent: input.creditSpent,
      message: input.message,
      readyFromMs: input.readyFromMs ?? 0,
      readyToMs: input.readyToMs ?? 0,
    },
  });
}
