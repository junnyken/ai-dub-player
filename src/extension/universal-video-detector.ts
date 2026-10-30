export type SupportedWebVideoPlatform =
  | "youtube"
  | "bilibili"
  | "vimeo"
  | "dailymotion"
  | "html5_generic";

export interface UniversalVideoDescriptor {
  platform: SupportedWebVideoPlatform;
  videoId: string; // Deterministic 11-char ID compatible with backend videoId lookup
  canonicalSourceUrl: string;
  pageTitle?: string;
}

function hashToElevenChars(input: string): string {
  let h1 = 0xdeadbeef ^ input.length;
  let h2 = 0x41c6ce57 ^ input.length;
  for (let i = 0; i < input.length; i++) {
    const ch = input.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 =
    Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^
    Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 =
    Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^
    Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  const combined =
    (h1 >>> 0).toString(36).padStart(6, "0") +
    (h2 >>> 0).toString(36).padStart(6, "0");
  return combined.replace(/[^a-zA-Z0-9_-]/g, "x").slice(0, 11);
}

export class UniversalVideoDetector {
  public detectFromUrl(params: {
    url: string;
    hasHtml5VideoElement?: boolean;
    pageTitle?: string;
  }): UniversalVideoDescriptor | null {
    let parsed: URL;
    try {
      parsed = new URL(params.url);
    } catch {
      return null;
    }

    if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
      return null;
    }

    const host = parsed.hostname.toLowerCase();

    // 1. YouTube watch / shorts
    if (
      host === "www.youtube.com" ||
      host === "youtube.com" ||
      host === "m.youtube.com"
    ) {
      if (parsed.pathname === "/watch") {
        const v = (parsed.searchParams.get("v") || "").trim();
        if (/^[a-zA-Z0-9_-]{11}$/.test(v)) {
          return {
            platform: "youtube",
            videoId: v,
            canonicalSourceUrl: `https://www.youtube.com/watch?v=${v}`,
            pageTitle: params.pageTitle,
          };
        }
      }
      if (parsed.pathname.startsWith("/shorts/")) {
        const seg = parsed.pathname.split("/").filter(Boolean)[1] || "";
        if (/^[a-zA-Z0-9_-]{11}$/.test(seg)) {
          return {
            platform: "youtube",
            videoId: seg,
            canonicalSourceUrl: `https://www.youtube.com/watch?v=${seg}`,
            pageTitle: params.pageTitle,
          };
        }
      }
      return null;
    }

    // 2. Bilibili (Anime / Animation / Gaming)
    if (host.endsWith("bilibili.com") || host.endsWith("bilibili.tv")) {
      if (
        parsed.pathname.includes("/video/") ||
        parsed.pathname.includes("/play/")
      ) {
        const videoId = hashToElevenChars(`bili_${parsed.hostname}${parsed.pathname}`);
        return {
          platform: "bilibili",
          videoId,
          canonicalSourceUrl: `https://www.youtube.com/watch?v=${videoId}`,
          pageTitle: params.pageTitle || "Bilibili Anime / Video",
        };
      }
    }

    // 3. Vimeo
    if (host.endsWith("vimeo.com")) {
      const seg = parsed.pathname.split("/").filter(Boolean)[0] || "";
      if (/^\d{5,}$/.test(seg)) {
        const videoId = hashToElevenChars(`vimeo_${seg}`);
        return {
          platform: "vimeo",
          videoId,
          canonicalSourceUrl: `https://www.youtube.com/watch?v=${videoId}`,
          pageTitle: params.pageTitle || `Vimeo Video (${seg})`,
        };
      }
    }

    // 4. Dailymotion
    if (host.endsWith("dailymotion.com")) {
      if (parsed.pathname.startsWith("/video/")) {
        const videoId = hashToElevenChars(`dm_${parsed.pathname}`);
        return {
          platform: "dailymotion",
          videoId,
          canonicalSourceUrl: `https://www.youtube.com/watch?v=${videoId}`,
          pageTitle: params.pageTitle || "Dailymotion Video",
        };
      }
    }

    // 5. Generic HTML5 Video page (Anime websites, educational portals, movie players)
    if (params.hasHtml5VideoElement) {
      const videoId = hashToElevenChars(
        `html5_${parsed.hostname}${parsed.pathname}${parsed.search}`
      );
      return {
        platform: "html5_generic",
        videoId,
        canonicalSourceUrl: `https://www.youtube.com/watch?v=${videoId}`,
        pageTitle: params.pageTitle || `HTML5 Video (${parsed.hostname})`,
      };
    }

    return null;
  }
}

export const universalVideoDetector = new UniversalVideoDetector();
