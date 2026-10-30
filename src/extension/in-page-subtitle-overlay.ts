export type ExtensionSubtitleMode = "off" | "source" | "target" | "bilingual";

export interface SubtitleOverlayRenderState {
  visible: boolean;
  mode: ExtensionSubtitleMode;
  speakerDisplayName: string | null;
  targetLine: string | null;
  sourceLine: string | null;
  bottomOffsetPx: number;
}

export class InPageSubtitleOverlay {
  private state: SubtitleOverlayRenderState = {
    visible: false,
    mode: "bilingual",
    speakerDisplayName: null,
    targetLine: null,
    sourceLine: null,
    bottomOffsetPx: 64, // Safely above YouTube's bottom player control bar
  };

  public updateCue(params: {
    mode: ExtensionSubtitleMode;
    speakerDisplayName?: string | null;
    sourceLine: string | null;
    targetLine: string | null;
  }): SubtitleOverlayRenderState {
    if (params.mode === "off" || (!params.sourceLine && !params.targetLine)) {
      this.state = {
        ...this.state,
        visible: false,
        mode: params.mode,
        speakerDisplayName: null,
        targetLine: null,
        sourceLine: null,
      };
      return this.getState();
    }

    this.state = {
      visible: true,
      mode: params.mode,
      speakerDisplayName: params.speakerDisplayName ?? null,
      targetLine: params.targetLine,
      sourceLine: params.sourceLine,
      bottomOffsetPx: 64,
    };
    return this.getState();
  }

  public clear(): SubtitleOverlayRenderState {
    this.state = {
      ...this.state,
      visible: false,
      speakerDisplayName: null,
      targetLine: null,
      sourceLine: null,
    };
    return this.getState();
  }

  public getState(): SubtitleOverlayRenderState {
    return { ...this.state };
  }
}
