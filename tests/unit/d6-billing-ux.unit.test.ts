import { describe, expect, it } from "vitest";
import { billingService } from "@/server/services/billing-service";
import { resolvePlayerShortcutAction } from "@/server/services/audio-mixer";

describe("D6 Unit: Billing Catalog & Studio Player Keyboard Shortcut Guard", () => {
  it("exposes structured Free, Pro, and Business plans with ascending duration limits and credit top-up packs", () => {
    const catalog = billingService.getCatalog();
    expect(catalog.plans).toHaveLength(3);

    const freePlan = catalog.plans.find((p) => p.id === "free")!;
    const proPlan = catalog.plans.find((p) => p.id === "pro")!;
    const bizPlan = catalog.plans.find((p) => p.id === "business")!;

    expect(freePlan.maxVideoDurationSeconds).toBe(900); // 15m
    expect(proPlan.maxVideoDurationSeconds).toBe(3600); // 60m
    expect(bizPlan.maxVideoDurationSeconds).toBe(10800); // 180m

    expect(catalog.creditPacks).toHaveLength(3);
    expect(catalog.creditPacks.map((c) => c.credits)).toEqual([30, 100, 300]);
  });

  it("maps studio keyboard shortcuts and safely ignores keypresses inside INPUT, TEXTAREA, SELECT, or with modifiers", () => {
    expect(resolvePlayerShortcutAction({ key: " " })).toBe("toggle_play");
    expect(resolvePlayerShortcutAction({ key: "k" })).toBe("toggle_play");
    expect(resolvePlayerShortcutAction({ key: "m" })).toBe(
      "toggle_original_audio"
    );
    expect(resolvePlayerShortcutAction({ key: "v" })).toBe("toggle_dub_audio");
    expect(resolvePlayerShortcutAction({ key: "c" })).toBe(
      "cycle_subtitle_mode"
    );
    expect(resolvePlayerShortcutAction({ key: "ArrowLeft" })).toBe(
      "seek_backward_5s"
    );
    expect(resolvePlayerShortcutAction({ key: "ArrowRight" })).toBe(
      "seek_forward_5s"
    );

    // Must ignore when typing in form fields or contentEditable
    expect(
      resolvePlayerShortcutAction({ key: " ", targetTagName: "INPUT" })
    ).toBeNull();
    expect(
      resolvePlayerShortcutAction({ key: "m", targetTagName: "TEXTAREA" })
    ).toBeNull();
    expect(
      resolvePlayerShortcutAction({ key: "v", targetTagName: "SELECT" })
    ).toBeNull();
    expect(
      resolvePlayerShortcutAction({ key: "c", isContentEditable: true })
    ).toBeNull();
    expect(
      resolvePlayerShortcutAction({ key: "c", ctrlKey: true })
    ).toBeNull();
  });
});
