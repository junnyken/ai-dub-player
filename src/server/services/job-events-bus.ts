import { EventEmitter } from "events";
import { JobProgressEvent } from "@/domain/models";

class JobEventsBus {
  private readonly emitter = new EventEmitter();

  constructor() {
    this.emitter.setMaxListeners(200);
  }

  public publish(event: JobProgressEvent): void {
    this.emitter.emit(`job:${event.jobId}`, event);
  }

  public subscribe(
    jobId: string,
    listener: (event: JobProgressEvent) => void
  ): () => void {
    const channel = `job:${jobId}`;
    this.emitter.on(channel, listener);
    return () => {
      this.emitter.off(channel, listener);
    };
  }
}

const globalForEvents = globalThis as unknown as {
  jobEventsBus: JobEventsBus | undefined;
};

export const jobEventsBus =
  globalForEvents.jobEventsBus ?? new JobEventsBus();

if (process.env.NODE_ENV !== "production") {
  globalForEvents.jobEventsBus = jobEventsBus;
}
