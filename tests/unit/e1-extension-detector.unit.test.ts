import fs from "fs";
import path from "path";
import { describe, expect, it } from "vitest";
import { YouTubePageDetector } from "@/extension/youtube-page-detector";
import { ExtensionApiClient } from "@/extension/extension-api-client";
import { InPageTriggerButton } from "@/extension/in-page-trigger-button";

describe("E1 Unit: Manifest V3, YouTubePageDetector & Idempotent Trigger Button Mounting", () => {
  it("validates extension/manifest.json adheres strictly to Section 6 Manifest V3 permissions and host scopes", () => {
    const manifestPath = path.join(process.cwd(), "extension", "manifest.json");
    const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf-8"));

    expect(manifest.manifest_version).toBe(3);
    expect(manifest.permissions).toEqual(["storage", "activeTab"]);
    expect(manifest.content_scripts[0].matches).toEqual([
      "https://www.youtube.com/watch*",
    ]);
  });

  it("detects valid YouTube watch URLs, rejects non-watch pages, and notifies SPA videoId changes", () => {
    const detector = new YouTubePageDetector();

    const valid = detector.detectFromUrl(
      "https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=15s"
    );
    expect(valid.isWatchPage).toBe(true);
    expect(valid.videoId).toBe("dQw4w9WgXcQ");
    expect(valid.normalizedWatchUrl).toBe(
      "https://www.youtube.com/watch?v=dQw4w9WgXcQ"
    );

    expect(detector.detectFromUrl("https://www.youtube.com/").isWatchPage).toBe(
      false
    );
    expect(
      detector.detectFromUrl("https://www.youtube.com/results?search_query=ai")
        .isWatchPage
    ).toBe(false);
    expect(
      detector.detectFromUrl("https://example.com/watch?v=dQw4w9WgXcQ")
        .isWatchPage
    ).toBe(false);

    const changes: Array<string | null> = [];
    detector.onVideoChange((res) => changes.push(res.videoId));

    detector.handleUrlNavigation("https://www.youtube.com/watch?v=dQw4w9WgXcQ");
    // Same videoId with timestamp hash change should not fire duplicate change
    detector.handleUrlNavigation(
      "https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=30s"
    );
    // SPA switch to second video
    detector.handleUrlNavigation("https://www.youtube.com/watch?v=9bZkp7q19f0");

    expect(changes).toEqual(["dQw4w9WgXcQ", "9bZkp7q19f0"]);
  });

  it("mounts InPageTriggerButton idempotently without creating duplicate DOM buttons across SPA updates", () => {
    const detector = new YouTubePageDetector();
    const apiClient = new ExtensionApiClient({
      fetchImpl: async () => ({
        ok: true,
        status: 200,
        json: async () => ({ job: null }),
      }),
    });

    const triggerBtn = new InPageTriggerButton({ detector, apiClient });
    const fakeActionContainer: {
      children: Array<{
        id?: string;
        textContent?: string;
        dataset?: Record<string, string>;
      }>;
    } = { children: [{ id: "yt-like-btn" }, { id: "yt-share-btn" }] };

    const mount1 = triggerBtn.mountOrUpdateIntoContainer(fakeActionContainer);
    const mount2 = triggerBtn.mountOrUpdateIntoContainer(fakeActionContainer);
    const mount3 = triggerBtn.mountOrUpdateIntoContainer(fakeActionContainer);

    expect(mount1.buttonCount).toBe(1);
    expect(mount2.buttonCount).toBe(1);
    expect(mount3.buttonCount).toBe(1);
    expect(mount3.buttonElement.id).toBe(InPageTriggerButton.BUTTON_DOM_ID);
  });
});
