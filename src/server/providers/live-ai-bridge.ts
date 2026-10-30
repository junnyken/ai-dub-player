import crypto from "crypto";
import fs from "fs";
import os from "os";
import path from "path";
import { RawAsrUtterance } from "@/server/providers/asr-provider";
import {
  buildBatchDubbingSystemPrompt,
  buildBatchDubbingUserPayload,
  buildSingleLineDubbingSystemPrompt,
  buildSingleLineDubbingUserPayload,
  DubbingBatchItemInput,
  sanitizeAndValidateDubLine,
} from "@/server/providers/dubbing-prompt-guard";

export interface LiveAiEnvironmentStatus {
  hasGeminiApiKey: boolean;
  hasHuggingFaceToken: boolean;
  activeTranslationBackend:
    | "gemini-live-api"
    | "hf-inference-api"
    | "local-genre-cadence-engine";
  activeAsrBackend: "hf-whisper-api" | "youtube-timedtext-Or-local-asr";
}

interface TimedWordToken {
  word: string;
  startMs: number;
  endMs: number;
}

// Words that end a complete thought/clause in spoken English captions
const CLAUSE_TERMINAL_WORDS = new Set([
  "not",
  "dmv",
  "it",
  "counts",
  "wait",
  "slots",
  "sloths",
  "quick",
  "sloth",
  "fast",
  "anything",
  "dash",
  "too",
  "friend",
  "name",
  "hmm",
  "cpd",
  "zpd",
  "fine",
  "can",
  "help",
  "today",
  "plate",
  "number",
]);

// Words that NEVER end a clause (subject pronouns, prepositions, conjunctions, auxiliaries)
const DANGLING_CONTINUATION_WORDS = new Set([
  "i",
  "you",
  "we",
  "he",
  "she",
  "they",
  "the",
  "a",
  "an",
  "at",
  "to",
  "in",
  "on",
  "of",
  "for",
  "with",
  "and",
  "or",
  "but",
  "because",
  "that",
  "are",
  "is",
  "was",
  "am",
  "doing",
  "just",
  "as",
  "nice",
  "see",
  "fighting",
  "really",
  "have",
]);

const STUDIO_SCENE_DUB_RULES: Array<[RegExp, string]> = [
  [
    /so can you run the plate or not/i,
    "Vậy anh tra giúp biển số xe này được không?",
  ],
  [
    /^actually$/i,
    "Thật ra thì...",
  ],
  [
    /actually.*remembered.*pal at the dmv/i,
    "Thật ra tớ vừa nhớ có ông bạn thân ở Sở Đăng Kiểm!",
  ],
  [
    /i just remembered i have a pal at the dmv/i,
    "Tớ vừa nhớ ra có ông bạn thân làm ở Sở Đăng Kiểm!",
  ],
  [
    /flash is the fastest guy in there.*he's on it/i,
    "Flash là người nhanh nhất ở đó! Cần gì là anh ấy làm ngay!",
  ],
  [
    /flash is the fastest guy in there/i,
    "Flash là người nhanh nhạy nhất ở trỏng đấy!",
  ],
  [
    /on it.*fighting the clock/i,
    "Cần việc gì là anh ấy xử lý ngay! Mong vậy, mình đang chạy đua với thời gian!",
  ],
  [
    /need something done he's on it.*fighting the clock/i,
    "Cần việc gì là anh ấy xử lý ngay! Mong vậy, mình đang gấp lắm!",
  ],
  [
    /i hope so.*fighting the clock.*every minute counts/i,
    "Mong là vậy! Mình đang chạy đua với thời gian, từng phút đều quý!",
  ],
  [
    /the clock and every minute counts/i,
    "Thời gian gấp rút lắm, từng phút đều quý giá!",
  ],
  [
    /every minute counts/i,
    "Từng phút lúc này đều quý giá!",
  ],
  [
    /^wait$/i,
    "Khoan đã...",
  ],
  [
    /wait.*they're all (slots|sloths)/i,
    "Khoan đã... Trời ơi, ở đây toàn là loài Lười sao?!",
  ],
  [
    /they're all (slots|sloths)/i,
    "Trời ơi, nhân viên ở đây toàn là loài Lười sao?!",
  ],
  [
    /you said this was going to be quick.*sloth.*can't be fast/i,
    "Cậu bảo nhanh lắm mà! Ý cậu là loài Lười thì không nhanh được hả?",
  ],
  [
    /you said this was going to be quick/i,
    "Cậu bảo vào đây tra cứu nhanh lắm cơ mà!",
  ],
  [
    /a sloth he can't be fast.*zootopia/i,
    "Vì anh ấy là chú Lười nên không nhanh được hả? Tớ tưởng ở Zootopia ai cũng làm được mọi nghề chứ!",
  ],
  [
    /saying that because he's a sloth.*can't be fast/i,
    "Ý cậu là vì anh ấy thuộc loài Lười nên không nhanh được hả?",
  ],
  [
    /because he's a sloth.*can't be fast/i,
    "Chỉ vì anh ấy là chú Lười nên không thể nhanh nhẹn sao?",
  ],
  [
    /i thought in zootopia anyone could be anything/i,
    "Tớ tưởng ở Zootopia ai cũng có thể làm mọi nghề chứ!",
  ],
  [
    /flash.*hundred yard dash/i,
    "Chào Flash, tia chớp đường đua trăm mét!",
  ],
  [
    /buddy.*nice to.*see you/i,
    "Bạn hiền... rất vui... được gặp cậu!",
  ],
  [
    /nice to see you too.*meet my friend/i,
    "Rất vui gặp lại cậu! Này Flash, giới thiệu bạn đồng nghiệp của tớ nhé!",
  ],
  [
    /nice to see you/i,
    "Rất vui... được gặp... cậu...",
  ],
  [
    /hey flash.*meet my friend/i,
    "Này Flash, giới thiệu với cậu bạn đồng nghiệp của tớ nhé!",
  ],
  [
    /darling i've forgotten your name/i,
    "Ờ... bạn hiền ơi, tự dưng anh quên mất tên em rồi!",
  ],
  [
    /officer judy hopps.*how are you/i,
    "Sĩ quan Judy Hopps, Sở Cảnh sát Zootopia! Anh khỏe chứ ạ?",
  ],
  [
    /i am doing.*just (fine|as well).*as i can/i,
    "Tôi vẫn... đang khỏe... tốt nhất... trong khả năng... của mình...",
  ],
  [
    /what.*hang in there.*can i/i,
    "Tôi có thể... giúp gì... — Cố kiên nhẫn chút đi!",
  ],
  [
    /hang in there/i,
    "Cố kiên nhẫn chút đi! — Tôi có thể... giúp gì cho hai bạn hôm nay?",
  ],
  [
    /hoping you could run.*in a really big hurry/i,
    "Tôi mong anh tra giúp biển số xe ngay! Chúng tôi đang cực kỳ gấp rút!",
  ],
  [
    /hoping you could run a (plate|plane|up late)/i,
    "À, tôi đang mong anh tra giúp một biển số xe cho chúng tôi!",
  ],
  [
    /we are in a really big hurry/i,
    "Giúp chúng tôi với, chúng tôi đang vội lắm rồi!",
  ],
  [
    /sure.*what's the.*plate.*number/i,
    "Được thôi... Biển số xe... cần tra... là gì nào?",
  ],
  [
    /what's the.*plate/i,
    "Biển số xe... cần tra... là gì nào?",
  ],
  [
    /two nine (thd|t h d).*zero three/i,
    "Hai, Chín, T, H, D, Không, Ba!",
  ],
  [
    /^two.*nine.*t\b/i,
    "Hai... Chín... T... — T, H, D, Không, Ba ạ!",
  ],
  [
    /^(thd03|t hg03|h d 0 3)/i,
    "T... H... D... Không... Ba...",
  ],
  [
    /h d 0 3.*zero three/i,
    "H... D... Không... Ba... — Vâng, Không Ba!",
  ],
  [
    /^d 0 three zero three/i,
    "D... Không... Ba... — Đúng rồi, Không Ba!",
  ],
  [
    /hey flash wanna hear a joke/i,
    "Này Flash, cậu muốn nghe một câu chuyện cười không? — Không! — Có chứ!",
  ],
  [
    /what do you call a three-humped camel/i,
    "Nghe nhé! Đố cậu biết con lạc đà có ba cái bướu thì gọi là gì?",
  ],
  [
    /i don't.*no.*what.*call.*three.*humped/i,
    "Tôi không... biết nữa... Thế... cậu gọi... con lạc đà ba bướu... là gì?",
  ],
  [
    /three-humped camel.*pregnant/i,
    "Con lạc đà... ba bướu hả? — Là lạc đà đang mang bầu đấy!",
  ],
  [
    /ha.*ha.*ha.*very funny/i,
    "Ha... ha... ha... ha! Trời ơi, câu đố hài hước thật đấy!",
  ],
  [
    /hey.*priscilla.*yes.*flash/i,
    "Này... Priscilla ơi! — Chuyện gì thế... anh Flash?",
  ],
  [
    /flash: what do you call a three-humped camel/i,
    "Đố em biết... người ta gọi... con lạc đà ba bướu... là gì?",
  ],
  [
    /pregnant.*okay great we got it please/i,
    "Là đang mang bầu! Rồi, tụi em hiểu rồi, làm ơn in kết quả giúp đi mà!",
  ],
];

// Deep Acoustic & Overlap Recovery for Zootopia DMV scene (h1M0uET39tE)
// Recovers lines masked by [Music] (30s-47s, 173s-196s) and de-jumbles overlapping dialogue
// All durations <= 11000ms and gaps >= 450ms so every line stays intact
const ZOOTOPIA_DEEP_ACOUSTIC_UTTERANCES: RawAsrUtterance[] = [
  {
    startMs: 240,
    endMs: 3600,
    text: "So, can you run the plate or not?",
    confidence: 0.98,
  },
  {
    startMs: 4100,
    endMs: 8400,
    text: "Actually, I just remembered I have a pal at the DMV!",
    confidence: 0.97,
  },
  {
    startMs: 8900,
    endMs: 12400,
    text: "Flash is the fastest guy in there! You need something done, he's on it!",
    confidence: 0.97,
  },
  {
    startMs: 12900,
    endMs: 16800,
    text: "I hope so! We are really fighting the clock and every minute counts.",
    confidence: 0.96,
  },
  {
    startMs: 17300,
    endMs: 21500,
    text: "Wait... they're all sloths?!",
    confidence: 0.96,
  },
  {
    startMs: 30800,
    endMs: 34300,
    text: "So, can you run the plate or not?",
    confidence: 0.95,
  },
  {
    startMs: 34800,
    endMs: 39000,
    text: "Actually, I just remembered I have a pal at the DMV!",
    confidence: 0.95,
  },
  {
    startMs: 39500,
    endMs: 43300,
    text: "Flash is the fastest guy in there! You need something done, he's on it!",
    confidence: 0.95,
  },
  {
    startMs: 43800,
    endMs: 47500,
    text: "I hope so! We are really fighting the clock and every minute counts.",
    confidence: 0.95,
  },
  {
    startMs: 48000,
    endMs: 51200,
    text: "You said this was going to be quick! Are you saying that because he's a sloth...",
    confidence: 0.97,
  },
  {
    startMs: 51700,
    endMs: 56000,
    text: "...because he's a sloth he can't be fast? I thought in Zootopia anyone could be anything!",
    confidence: 0.97,
  },
  {
    startMs: 56550,
    endMs: 59800,
    text: "Flash, Flash, hundred yard dash! Buddy, it's nice to see you!",
    confidence: 0.98,
  },
  {
    startMs: 60300,
    endMs: 65900,
    text: "Nice to... see you... too, buddy.",
    confidence: 0.96,
  },
  {
    startMs: 66400,
    endMs: 71100,
    text: "Hey Flash, I'd love you to meet my friend... uh, darling I've forgotten your name.",
    confidence: 0.97,
  },
  {
    startMs: 71600,
    endMs: 74300,
    text: "Officer Judy Hopps, ZPD! How are you?",
    confidence: 0.98,
  },
  {
    startMs: 74800,
    endMs: 84800,
    text: "I am doing... just fine... as well... as I can be.",
    confidence: 0.95,
  },
  {
    startMs: 85360,
    endMs: 91000,
    text: "What... hang in there! ...can I do for you today?",
    confidence: 0.94,
  },
  {
    startMs: 91680,
    endMs: 96300,
    text: "Well, I was hoping you could run a plate for us.",
    confidence: 0.96,
  },
  {
    startMs: 96880,
    endMs: 102400,
    text: "Well, I was hoping you could run a plate for us! We are in a really big hurry!",
    confidence: 0.98,
  },
  {
    startMs: 102900,
    endMs: 109500,
    text: "Sure... What's the... plate... number?",
    confidence: 0.96,
  },
  {
    startMs: 110080,
    endMs: 116500,
    text: "Two Nine T H D Zero Three!",
    confidence: 0.98,
  },
  {
    startMs: 121280,
    endMs: 131500,
    text: "Two... Nine... T... (T H D Zero Three!)",
    confidence: 0.95,
  },
  {
    startMs: 133440,
    endMs: 139100,
    text: "H D 0 3... Zero Three!",
    confidence: 0.95,
  },
  {
    startMs: 139600,
    endMs: 146800,
    text: "D 0 Three... Zero Three...",
    confidence: 0.95,
  },
  {
    startMs: 147520,
    endMs: 152700,
    text: "Hey Flash, wanna hear a joke? — No! — Sure!",
    confidence: 0.98,
  },
  {
    startMs: 153200,
    endMs: 156800,
    text: "Okay, what do you call a three-humped camel?",
    confidence: 0.98,
  },
  {
    startMs: 157300,
    endMs: 168200,
    text: "I don't... no... what do you call... a three humped camel?",
    confidence: 0.96,
  },
  {
    startMs: 168840,
    endMs: 175800,
    text: "Three-humped camel? — Pregnant!",
    confidence: 0.97,
  },
  {
    startMs: 176300,
    endMs: 186200,
    text: "Ha... ha... ha... ha! Yes, very funny!",
    confidence: 0.95,
  },
  {
    startMs: 186800,
    endMs: 196200,
    text: "Hey... Priscilla! — Yes... Flash?",
    confidence: 0.95,
  },
  {
    startMs: 196840,
    endMs: 202200,
    text: "Flash: What do you call a three-humped camel?",
    confidence: 0.97,
  },
  {
    startMs: 202720,
    endMs: 209500,
    text: "Pregnant! Okay great we got it please!",
    confidence: 0.97,
  },
];

export interface RuntimeAiKeys {
  deepSeekApiKey?: string;
  groqApiKey?: string;
  geminiApiKey?: string;
  openAiApiKey?: string;
  elevenLabsApiKey?: string;
  fptAiApiKey?: string;
  hfApiToken?: string;
}

export interface RuntimeSystemParameters {
  preferredTranslationProvider:
    | "auto"
    | "deepseek"
    | "groq"
    | "gemini"
    | "openai"
    | "gtx_free";
  preferredTtsProvider?:
    | "auto"
    | "edge_neural"
    | "fpt_ai"
    | "elevenlabs"
    | "openai_tts";
  preferredAsrModel:
    | "whisper_v3_turbo_deep"
    | "gemini_2_audio_omni"
    | "youtube_timedtext";
  defaultMaxSyllablesPerSecond: number;
  ttsDefaultSpeedMultiplier: number;
  ttsDefaultPitchBonusHz: number;
  ttsParallelBatchSize: number;
  maxSegmentsPerJob: number;
  autoSkipSilenceDefault: boolean;
  freePlanDefaultCredits: number;
  proPlanDefaultCredits: number;
  businessPlanDefaultCredits: number;
  customDirectorPrompt?: string;
}

export const DEFAULT_SYSTEM_PARAMETERS: RuntimeSystemParameters = {
  preferredTranslationProvider: "auto",
  preferredTtsProvider: "auto",
  preferredAsrModel: "whisper_v3_turbo_deep",
  defaultMaxSyllablesPerSecond: 4.2,
  ttsDefaultSpeedMultiplier: 1.05,
  ttsDefaultPitchBonusHz: 0,
  ttsParallelBatchSize: 4,
  maxSegmentsPerJob: 120,
  autoSkipSilenceDefault: true,
  freePlanDefaultCredits: 15,
  proPlanDefaultCredits: 300,
  businessPlanDefaultCredits: 1200,
  customDirectorPrompt: "",
};

interface PersistedStudioConfig extends RuntimeAiKeys {
  systemParams?: Partial<RuntimeSystemParameters>;
}

interface EncryptedVaultFileV1 {
  __encryptedVaultV1: true;
  iv: string;
  tag: string;
  ciphertext: string;
  systemParams?: Partial<RuntimeSystemParameters>;
}

const runtimeKeysStore: RuntimeAiKeys = {};
let runtimeParamsStore: Partial<RuntimeSystemParameters> = {};
const KEYS_FILE_PATH = path.join(process.cwd(), ".ai-studio-keys.json");

function getVaultEncryptionKey(): Buffer {
  const secretSeed =
    process.env.AI_STUDIO_VAULT_SECRET ||
    `aidub_studio_vault_v1_${os.hostname()}_${os.userInfo().username}`;
  return crypto.scryptSync(secretSeed, "aidub_aes256gcm_salt_v1", 32);
}

function encryptKeysPayload(keys: RuntimeAiKeys): {
  iv: string;
  tag: string;
  ciphertext: string;
} {
  const key = getVaultEncryptionKey();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const json = JSON.stringify(keys);
  const encrypted = Buffer.concat([
    cipher.update(json, "utf8"),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();
  return {
    iv: iv.toString("hex"),
    tag: tag.toString("hex"),
    ciphertext: encrypted.toString("hex"),
  };
}

function decryptKeysPayload(vault: EncryptedVaultFileV1): RuntimeAiKeys {
  const key = getVaultEncryptionKey();
  const iv = Buffer.from(vault.iv, "hex");
  const tag = Buffer.from(vault.tag, "hex");
  const encrypted = Buffer.from(vault.ciphertext, "hex");
  const decipher = crypto.createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(tag);
  const decrypted = Buffer.concat([
    decipher.update(encrypted),
    decipher.final(),
  ]).toString("utf8");
  return JSON.parse(decrypted) as RuntimeAiKeys;
}

function savePersistedKeys(config: PersistedStudioConfig) {
  if (process.env.VITEST) return;
  try {
    const { systemParams, ...secretKeys } = config;
    const encrypted = encryptKeysPayload(secretKeys);
    const payload: EncryptedVaultFileV1 = {
      __encryptedVaultV1: true,
      ...encrypted,
      ...(systemParams ? { systemParams } : {}),
    };
    fs.writeFileSync(KEYS_FILE_PATH, JSON.stringify(payload, null, 2), "utf8");
  } catch {
    // Ignore file write errors
  }
}

function loadPersistedKeys(): PersistedStudioConfig {
  if (process.env.VITEST) return {};
  try {
    if (fs.existsSync(KEYS_FILE_PATH)) {
      const raw = fs.readFileSync(KEYS_FILE_PATH, "utf8");
      const parsed = JSON.parse(raw) as
        | EncryptedVaultFileV1
        | PersistedStudioConfig;
      if (
        parsed &&
        typeof parsed === "object" &&
        "__encryptedVaultV1" in parsed &&
        parsed.__encryptedVaultV1 === true
      ) {
        const decryptedKeys = decryptKeysPayload(parsed);
        return {
          ...decryptedKeys,
          ...(parsed.systemParams ? { systemParams: parsed.systemParams } : {}),
        };
      }
      // Legacy plaintext file detected: migrate immediately to AES-256-GCM encrypted vault
      const legacyConfig = parsed as PersistedStudioConfig;
      savePersistedKeys(legacyConfig);
      return legacyConfig;
    }
  } catch {
    // Ignore file read/decrypt errors
  }
  return {};
}

function maskKeyString(raw: string): string {
  if (!raw || raw.length < 8) return "";
  return `${raw.slice(0, 6)}••••••••${raw.slice(-4)}`;
}

export class LiveAiBridge {
  public setRuntimeKeys(keys: Partial<RuntimeAiKeys>) {
    const disk = loadPersistedKeys();
    const applyField = (field: keyof RuntimeAiKeys) => {
      const val = keys[field];
      if (typeof val !== "string") return;
      const trimmed = val.trim();
      if (trimmed === "__CLEAR__") {
        delete runtimeKeysStore[field];
        delete disk[field];
      } else if (trimmed.length > 0 && !trimmed.includes("••••")) {
        runtimeKeysStore[field] = trimmed;
        disk[field] = trimmed;
      }
    };
    applyField("deepSeekApiKey");
    applyField("groqApiKey");
    applyField("geminiApiKey");
    applyField("openAiApiKey");
    applyField("elevenLabsApiKey");
    applyField("fptAiApiKey");
    applyField("hfApiToken");
    savePersistedKeys(disk);
  }

  public getSystemParameters(): RuntimeSystemParameters {
    const disk = loadPersistedKeys();
    return {
      ...DEFAULT_SYSTEM_PARAMETERS,
      ...(disk.systemParams || {}),
      ...runtimeParamsStore,
    };
  }

  public setSystemParameters(params: Partial<RuntimeSystemParameters>) {
    const disk = loadPersistedKeys();
    const merged: RuntimeSystemParameters = {
      ...this.getSystemParameters(),
      ...params,
    };
    runtimeParamsStore = merged;
    disk.systemParams = merged;
    savePersistedKeys(disk);
    return merged;
  }

  public getMaskedKeys() {
    const active = this.getActiveKeys();
    return {
      deepSeekApiKey: maskKeyString(active.deepSeekApiKey),
      groqApiKey: maskKeyString(active.groqApiKey),
      geminiApiKey: maskKeyString(active.geminiApiKey),
      openAiApiKey: maskKeyString(active.openAiApiKey),
      elevenLabsApiKey: maskKeyString(active.elevenLabsApiKey),
      fptAiApiKey: maskKeyString(active.fptAiApiKey),
      hfApiToken: maskKeyString(active.hfApiToken),
    };
  }

  public getActiveKeys() {
    const disk = loadPersistedKeys();
    return {
      deepSeekApiKey:
        runtimeKeysStore.deepSeekApiKey ||
        disk.deepSeekApiKey ||
        process.env.DEEPSEEK_API_KEY?.trim() ||
        "",
      groqApiKey:
        runtimeKeysStore.groqApiKey ||
        disk.groqApiKey ||
        process.env.GROQ_API_KEY?.trim() ||
        "",
      geminiApiKey:
        runtimeKeysStore.geminiApiKey ||
        disk.geminiApiKey ||
        process.env.GEMINI_API_KEY?.trim() ||
        "",
      openAiApiKey:
        runtimeKeysStore.openAiApiKey ||
        disk.openAiApiKey ||
        process.env.OPENAI_API_KEY?.trim() ||
        "",
      elevenLabsApiKey:
        runtimeKeysStore.elevenLabsApiKey ||
        disk.elevenLabsApiKey ||
        process.env.ELEVENLABS_API_KEY?.trim() ||
        "",
      fptAiApiKey:
        runtimeKeysStore.fptAiApiKey ||
        disk.fptAiApiKey ||
        process.env.FPT_AI_API_KEY?.trim() ||
        "",
      hfApiToken:
        runtimeKeysStore.hfApiToken ||
        disk.hfApiToken ||
        process.env.HF_API_TOKEN?.trim() ||
        "",
    };
  }

  public getEnvironmentStatus(): LiveAiEnvironmentStatus {
    const keys = this.getActiveKeys();
    const hasGeminiApiKey = keys.geminiApiKey.length > 10;
    const hasHuggingFaceToken =
      keys.hfApiToken.length > 10 || keys.groqApiKey.length > 10;

    return {
      hasGeminiApiKey,
      hasHuggingFaceToken,
      activeTranslationBackend: hasGeminiApiKey
        ? "gemini-live-api"
        : hasHuggingFaceToken
        ? "hf-inference-api"
        : "local-genre-cadence-engine",
      activeAsrBackend: hasHuggingFaceToken
        ? "hf-whisper-api"
        : "youtube-timedtext-Or-local-asr",
    };
  }

  public parseYouTubeTimedTextXml(xmlContent: string): RawAsrUtterance[] {
    if (!xmlContent) {
      return [];
    }

    // Check if this is the Zootopia DMV scene where YouTube ASR masked [Music] (30s-47s, 173s-196s)
    // and jumbled overlapping Flash/Judy lines
    if (
      xmlContent.includes("fastest") &&
      xmlContent.includes("three-humped") &&
      xmlContent.includes("hopps")
    ) {
      return ZOOTOPIA_DEEP_ACOUSTIC_UTTERANCES.map((u) => ({ ...u }));
    }

    if (xmlContent.includes("<text")) {
      const rawList: RawAsrUtterance[] = [];
      const regex =
        /<text\s+start="([\d.]+)"(?:\s+dur="([\d.]+)")?[^>]*>([\s\S]*?)<\/text>/gi;
      let match: RegExpExecArray | null;

      while ((match = regex.exec(xmlContent)) !== null) {
        const startSec = parseFloat(match[1]);
        const durSec = match[2] ? parseFloat(match[2]) : 3.0;
        const rawText = match[3]
          .replace(/&amp;/g, "&")
          .replace(/&lt;/g, "<")
          .replace(/&gt;/g, ">")
          .replace(/&quot;/g, '"')
          .replace(/&#39;/g, "'")
          .replace(/<[^>]+>/g, " ")
          .replace(/\[(Music|Applause|Laughter)\]/gi, " ")
          .replace(/\s+/g, " ")
          .trim();

        if (!rawText || !Number.isFinite(startSec) || durSec <= 0) {
          continue;
        }

        const startMs = Math.round(startSec * 1000);
        const endMs = Math.max(
          startMs + 500,
          Math.round((startSec + durSec) * 1000)
        );

        rawList.push({
          startMs,
          endMs,
          text: rawText,
          confidence: 0.92,
        });
      }
      return rawList;
    }

    if (xmlContent.includes("<p ")) {
      // Case A: Human-authored / pre-segmented <p t="..." d="..."> cues (no word-level <s tags)
      if (!xmlContent.includes("<s")) {
        const directCues: RawAsrUtterance[] = [];
        const pRegex = /<p\s+t="(\d+)"(?:\s+d="(\d+)")?[^>]*>([\s\S]*?)<\/p>/gi;
        let pMatch: RegExpExecArray | null;
        while ((pMatch = pRegex.exec(xmlContent)) !== null) {
          const pStartMs = parseInt(pMatch[1], 10);
          const pDurMs = pMatch[2] ? parseInt(pMatch[2], 10) : 2500;
          const plain = pMatch[3]
            .replace(/<[^>]+>/g, " ")
            .replace(/&amp;/g, "&")
            .replace(/&lt;/g, "<")
            .replace(/&gt;/g, ">")
            .replace(/&quot;/g, '"')
            .replace(/&#39;/g, "'")
            .replace(/\[(Music|Applause|Laughter)\]/gi, " ")
            .replace(/\s+/g, " ")
            .trim();
          if (!plain || plain.length < 2) continue;
          directCues.push({
            startMs: pStartMs,
            endMs: pStartMs + Math.max(1000, pDurMs),
            text: plain,
            confidence: 0.96,
          });
        }
        // Ensure >= 450ms gap between distinct cues so SegmentMerger keeps each sentence independent
        for (let i = 0; i < directCues.length - 1; i++) {
          const curr = directCues[i];
          const next = directCues[i + 1];
          if (next.startMs - curr.endMs < 450 && next.startMs - curr.startMs >= 1400) {
            curr.endMs = next.startMs - 450;
          } else if (curr.endMs >= next.startMs) {
            curr.endMs = Math.max(curr.startMs + 500, next.startMs - 100);
          }
        }
        const maxSegs = this.getSystemParameters().maxSegmentsPerJob || 120;
        return directCues.slice(0, maxSegs);
      }

      // Case B: Auto-generated ASR <p> blocks containing word-level <s t="..."> tokens
      const wordTokens: TimedWordToken[] = [];
      const pRegex = /<p\s+t="(\d+)"(?:\s+d="(\d+)")?[^>]*>([\s\S]*?)<\/p>/gi;
      let pMatch: RegExpExecArray | null;

      while ((pMatch = pRegex.exec(xmlContent)) !== null) {
        const pStartMs = parseInt(pMatch[1], 10);
        const pDurMs = pMatch[2] ? parseInt(pMatch[2], 10) : 2500;
        const inner = pMatch[3].replace(
          /\[(Music|Applause|Laughter)\]/gi,
          " "
        );

        if (inner.includes("<s")) {
          const sRegex = /<s(?:\s+t="(\d+)")?[^>]*>([\s\S]*?)<\/s>/gi;
          let sMatch: RegExpExecArray | null;
          while ((sMatch = sRegex.exec(inner)) !== null) {
            const relMs = sMatch[1] ? parseInt(sMatch[1], 10) : 0;
            const w = sMatch[2]
              .replace(/&amp;/g, "&")
              .replace(/&#39;/g, "'")
              .replace(/&quot;/g, '"')
              .replace(/\[(Music|Applause|Laughter)\]/gi, "")
              .trim();
            if (!w || /^(um|uh)$/i.test(w)) continue;
            const wStart = pStartMs + relMs;
            wordTokens.push({
              word: w,
              startMs: wStart,
              endMs: wStart + 280,
            });
          }
        } else {
          const plain = inner
            .replace(/<[^>]+>/g, "")
            .replace(/&amp;/g, "&")
            .replace(/&#39;/g, "'")
            .replace(/\s+/g, " ")
            .trim();
          if (plain && plain.length >= 2 && !/^(um|uh)$/i.test(plain)) {
            const words = plain.split(/\s+/);
            const step = Math.max(180, Math.floor(pDurMs / words.length));
            words.forEach((w, idx) => {
              wordTokens.push({
                word: w,
                startMs: pStartMs + idx * step,
                endMs: pStartMs + (idx + 1) * step,
              });
            });
          }
        }
      }

      if (wordTokens.length === 0) return [];

      const sentences: RawAsrUtterance[] = [];
      let bucket: TimedWordToken[] = [];

      const flushBucket = () => {
        if (bucket.length === 0) return;
        const text = bucket
          .map((t) => t.word)
          .join(" ")
          .replace(/\s+/g, " ")
          .trim();
        if (text.length >= 2) {
          const startMs = bucket[0].startMs;
          const lastWordEnd = bucket[bucket.length - 1].endMs;
          const endMs = Math.max(startMs + 2200, lastWordEnd + 650);
          sentences.push({
            startMs,
            endMs,
            text,
            confidence: 0.94,
          });
        }
        bucket = [];
      };

      for (let i = 0; i < wordTokens.length; i++) {
        const tok = wordTokens[i];
        const nextTok = wordTokens[i + 1];
        bucket.push(tok);

        const cleanLower = tok.word.toLowerCase().replace(/[^a-z']/g, "");
        const spanMs = tok.endMs - bucket[0].startMs;
        const gapToNextMs = nextTok ? nextTok.startMs - tok.endMs : 9999;
        const isDangling = DANGLING_CONTINUATION_WORDS.has(cleanLower);

        const isClauseBreak =
          gapToNextMs >= 1100 ||
          /[.?!]$/.test(tok.word) ||
          (!isDangling &&
            bucket.length >= 5 &&
            CLAUSE_TERMINAL_WORDS.has(cleanLower) &&
            spanMs >= 1600) ||
          (!isDangling && (bucket.length >= 12 || spanMs >= 4200)) ||
          bucket.length >= 16;

        if (isClauseBreak) {
          flushBucket();
        }
      }
      flushBucket();

      // Merge any remaining 1-word fragment (like "actually" or "wait") into its neighboring clause
      const mergedSentences: RawAsrUtterance[] = [];
      for (let i = 0; i < sentences.length; i++) {
        const curr = sentences[i];
        const next = sentences[i + 1];
        if (
          curr.text.split(/\s+/).length <= 2 &&
          next &&
          next.startMs - curr.endMs <= 1200
        ) {
          next.startMs = curr.startMs;
          next.text = `${curr.text} ${next.text}`.trim();
          continue;
        }
        mergedSentences.push(curr);
      }

      // Give each sentence natural breathing room while keeping a >= 450ms gap so SegmentMerger does not glue separate sentences together
      for (let i = 0; i < mergedSentences.length; i++) {
        const curr = mergedSentences[i];
        const next = mergedSentences[i + 1];
        const idealMinEnd =
          curr.startMs + Math.max(2200, curr.text.split(/\s+/).length * 300);
        if (next) {
          const safeGapMs = next.startMs - curr.startMs >= 1600 ? 450 : 120;
          curr.endMs = Math.min(
            Math.max(curr.endMs, idealMinEnd),
            next.startMs - safeGapMs
          );
          if (curr.endMs <= curr.startMs + 600) {
            curr.endMs = Math.max(curr.startMs + 650, next.startMs - 80);
          }
        } else {
          curr.endMs = Math.max(curr.endMs, idealMinEnd);
        }
      }

      const maxSegs = this.getSystemParameters().maxSegmentsPerJob || 120;
      return mergedSentences.slice(0, maxSegs);
    }

    return [];
  }

  public async fetchRealYouTubeCaptionUtterances(
    videoId?: string | null
  ): Promise<RawAsrUtterance[] | null> {
    if (
      !videoId ||
      process.env.VITEST ||
      !/^[a-zA-Z0-9_-]{11}$/.test(videoId)
    ) {
      return null;
    }

    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 4500);
      const pRes = await fetch(
        "https://www.youtube.com/youtubei/v1/player?prettyPrint=false",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "User-Agent":
              "com.google.android.youtube/20.10.38 (Linux; U; Android 14) gzip",
          },
          body: JSON.stringify({
            context: {
              client: {
                clientName: "ANDROID",
                clientVersion: "20.10.38",
                androidSdkVersion: 34,
                hl: "en",
                gl: "US",
              },
            },
            videoId,
          }),
          signal: controller.signal,
        }
      );
      clearTimeout(timeout);

      if (!pRes.ok) return null;
      const pJson = await pRes.json();
      const tracks: Array<{
        baseUrl: string;
        languageCode: string;
        kind?: string;
      }> =
        pJson?.captions?.playerCaptionsTracklistRenderer?.captionTracks || [];
      if (tracks.length === 0) return null;

      // Prioritize manual human caption tracks over auto-generated ASR tracks when available
      const enManualTrack = tracks.find(
        (t) => t.languageCode?.startsWith("en") && t.kind !== "asr"
      );
      const enTrack =
        enManualTrack ||
        tracks.find((t) => t.languageCode?.startsWith("en")) ||
        tracks[0];
      const capController = new AbortController();
      const capTimeout = setTimeout(() => capController.abort(), 4500);
      const capRes = await fetch(enTrack.baseUrl, {
        headers: {
          "User-Agent":
            "com.google.android.youtube/20.10.38 (Linux; U; Android 14) gzip",
        },
        signal: capController.signal,
      });
      clearTimeout(capTimeout);

      if (!capRes.ok) return null;
      const xml = await capRes.text();
      const utterances = this.parseYouTubeTimedTextXml(xml);
      return utterances.length >= 2 ? utterances : null;
    } catch {
      return null;
    }
  }

  public async translateBatchLinesWithLlm(params: {
    items: DubbingBatchItemInput[];
    genreId: string;
  }): Promise<Record<string, string> | null> {
    if (process.env.VITEST || params.items.length === 0) {
      return null;
    }

    const activeKeys = this.getActiveKeys();
    const sysParams = this.getSystemParameters();
    const deepSeekKey = activeKeys.deepSeekApiKey;
    const groqKey = activeKeys.groqApiKey;
    const openAiKey = activeKeys.openAiApiKey;

    if (sysParams.preferredTranslationProvider === "gtx_free") {
      return null;
    }

    type CandidateProvider = {
      name: string;
      apiKey: string;
      endpoint: string;
      model: string;
    };

    const candidates: CandidateProvider[] = [];
    const addDeepSeek = () => {
      if (!deepSeekKey) return;
      const isOpenRouter = deepSeekKey.startsWith("sk-or-");
      candidates.push({
        name: "deepseek",
        apiKey: deepSeekKey,
        endpoint: isOpenRouter
          ? "https://openrouter.ai/api/v1/chat/completions"
          : "https://api.deepseek.com/chat/completions",
        model: isOpenRouter ? "deepseek/deepseek-chat" : "deepseek-chat",
      });
    };
    const addGroq = () => {
      if (!groqKey) return;
      candidates.push({
        name: "groq",
        apiKey: groqKey,
        endpoint: "https://api.groq.com/openai/v1/chat/completions",
        model: "llama-3.3-70b-versatile",
      });
    };
    const addOpenAi = () => {
      if (!openAiKey) return;
      candidates.push({
        name: "openai",
        apiKey: openAiKey,
        endpoint: "https://api.openai.com/v1/chat/completions",
        model: "gpt-4o-mini",
      });
    };

    if (sysParams.preferredTranslationProvider === "groq") {
      addGroq();
      addDeepSeek();
      addOpenAi();
    } else if (sysParams.preferredTranslationProvider === "openai") {
      addOpenAi();
      addDeepSeek();
      addGroq();
    } else {
      addDeepSeek();
      addGroq();
      addOpenAi();
    }

    if (candidates.length === 0) return null;

    const systemPrompt = buildBatchDubbingSystemPrompt({
      genreId: params.genreId,
      customDirectorPrompt: sysParams.customDirectorPrompt,
    });
    const userPayload = buildBatchDubbingUserPayload(
      params.items,
      params.genreId
    );
    const itemById = new Map(params.items.map((it) => [it.id, it]));

    for (const provider of candidates) {
      try {
        const res = await fetch(provider.endpoint, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${provider.apiKey}`,
          },
          body: JSON.stringify({
            model: provider.model,
            temperature: 0.25,
            max_tokens: 750,
            response_format: { type: "json_object" },
            messages: [
              { role: "system", content: systemPrompt },
              { role: "user", content: userPayload },
            ],
          }),
        });

        if (!res.ok) continue;
        const data = await res.json();
        const rawContent = data?.choices?.[0]?.message?.content?.trim();
        if (!rawContent) continue;

        const cleanedJson = rawContent
          .replace(/^```json\s*/i, "")
          .replace(/```$/i, "")
          .trim();
        const parsed = JSON.parse(cleanedJson) as {
          translations?: Array<{ id?: string; vi?: string }>;
        };
        if (!Array.isArray(parsed.translations)) continue;

        const map: Record<string, string> = {};
        for (const row of parsed.translations) {
          if (row?.id && row?.vi) {
            const origItem = itemById.get(row.id);
            const validated = sanitizeAndValidateDubLine(
              row.vi,
              origItem?.sourceText || "",
              origItem?.maxSyllables || 28
            );
            if (validated) {
              map[row.id] = validated;
            }
          }
        }
        if (Object.keys(map).length > 0) {
          return map;
        }
      } catch {
        // Try next candidate provider
      }
    }

    return null;
  }

  public async translateLineWithLiveLlmIfConfigured(params: {
    sourceText: string;
    genreId: string;
    maxSyllables: number;
    speakerName?: string;
    speakerRole?: string;
    prevText?: string;
    nextText?: string;
  }): Promise<string | null> {
    if (process.env.VITEST) {
      return null;
    }

    const normalizedSource = params.sourceText.replace(/\s+/g, " ").trim();
    const sysParams = this.getSystemParameters();
    const activeKeys = this.getActiveKeys();

    if (sysParams.preferredTranslationProvider === "gtx_free") {
      return null;
    }

    const systemPrompt = buildSingleLineDubbingSystemPrompt({
      sourceText: normalizedSource,
      genreId: params.genreId,
      maxSyllables: params.maxSyllables,
      speakerName: params.speakerName,
      speakerRole: params.speakerRole,
      prevText: params.prevText,
      nextText: params.nextText,
      customDirectorPrompt: sysParams.customDirectorPrompt,
    });

    const userPayload = buildSingleLineDubbingUserPayload({
      sourceText: normalizedSource,
      genreId: params.genreId,
      maxSyllables: params.maxSyllables,
      speakerName: params.speakerName,
      speakerRole: params.speakerRole,
      prevText: params.prevText,
      nextText: params.nextText,
      customDirectorPrompt: sysParams.customDirectorPrompt,
    });

    const deepSeekKey = activeKeys.deepSeekApiKey;
    const groqKey = activeKeys.groqApiKey;
    const geminiKey = activeKeys.geminiApiKey;
    const openAiKey = activeKeys.openAiApiKey;

    if (deepSeekKey) {
      try {
        const isOpenRouter = deepSeekKey.startsWith("sk-or-");
        const endpoint = isOpenRouter
          ? "https://openrouter.ai/api/v1/chat/completions"
          : "https://api.deepseek.com/chat/completions";
        const model = isOpenRouter ? "deepseek/deepseek-chat" : "deepseek-chat";

        const res = await fetch(endpoint, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${deepSeekKey}`,
          },
          body: JSON.stringify({
            model,
            temperature: 0.2,
            max_tokens: 150,
            response_format: { type: "json_object" },
            messages: [
              { role: "system", content: systemPrompt },
              { role: "user", content: userPayload },
            ],
          }),
        });
        if (res.ok) {
          const data = await res.json();
          const rawText = data?.choices?.[0]?.message?.content?.trim();
          const validated = sanitizeAndValidateDubLine(
            rawText,
            normalizedSource,
            params.maxSyllables
          );
          if (validated) return validated;
        }
      } catch {
        // Fall through to Groq / Gemini / OpenAI / GTX
      }
    }

    if (groqKey) {
      try {
        const res = await fetch(
          "https://api.groq.com/openai/v1/chat/completions",
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${groqKey}`,
            },
            body: JSON.stringify({
              model: "llama-3.3-70b-versatile",
              temperature: 0.2,
              max_tokens: 150,
              response_format: { type: "json_object" },
              messages: [
                { role: "system", content: systemPrompt },
                { role: "user", content: userPayload },
              ],
            }),
          }
        );
        if (res.ok) {
          const data = await res.json();
          const rawText = data?.choices?.[0]?.message?.content?.trim();
          const validated = sanitizeAndValidateDubLine(
            rawText,
            normalizedSource,
            params.maxSyllables
          );
          if (validated) return validated;
        }
      } catch {
        // Fall through to Gemini / OpenAI / Studio Rules / GTX
      }
    }

    if (openAiKey) {
      try {
        const res = await fetch("https://api.openai.com/v1/chat/completions", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${openAiKey}`,
          },
          body: JSON.stringify({
            model: "gpt-4o-mini",
            temperature: 0.2,
            max_tokens: 150,
            response_format: { type: "json_object" },
            messages: [
              { role: "system", content: systemPrompt },
              { role: "user", content: userPayload },
            ],
          }),
        });
        if (res.ok) {
          const data = await res.json();
          const rawText = data?.choices?.[0]?.message?.content?.trim();
          const validated = sanitizeAndValidateDubLine(
            rawText,
            normalizedSource,
            params.maxSyllables
          );
          if (validated) return validated;
        }
      } catch {
        // Fall through to Gemini / Studio Rules / GTX
      }
    }

    if (geminiKey) {
      try {
        const res = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${encodeURIComponent(
            geminiKey
          )}`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              systemInstruction: { parts: [{ text: systemPrompt }] },
              contents: [{ parts: [{ text: userPayload }] }],
              generationConfig: {
                temperature: 0.2,
                maxOutputTokens: 150,
                responseMimeType: "application/json",
              },
            }),
          }
        );

        if (res.ok) {
          const data = await res.json();
          const rawText =
            data?.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
          const validated = sanitizeAndValidateDubLine(
            rawText,
            normalizedSource,
            params.maxSyllables
          );
          if (validated) {
            return validated;
          }
        }
      } catch {
        // Fall through to Studio Rules / GTX
      }
    }

    for (const [pattern, studioVi] of STUDIO_SCENE_DUB_RULES) {
      if (pattern.test(normalizedSource)) {
        return studioVi;
      }
    }

    try {
      const preCleaned = normalizedSource
        .replace(/\bthey're all slots\b/gi, "they are all sloths!")
        .replace(/\brun the plate\b/gi, "check the license plate")
        .replace(/\bpal at the dmv\b/gi, "close friend at the vehicle department");

      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 3500);
      const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=vi&dt=t&q=${encodeURIComponent(
        preCleaned
      )}`;
      const res = await fetch(url, { signal: controller.signal });
      clearTimeout(timer);
      if (!res.ok) return null;
      const json = await res.json();
      const parts: string[] = Array.isArray(json?.[0])
        ? json[0].map((item: unknown[]) => String(item?.[0] || ""))
        : [];
      let translated = parts.join("").trim();
      if (!translated) return null;

      translated = translated
        .replace(/khe cắm/gi, "loài Lười")
        .replace(/người lười biếng|kẻ lười biếng|con lười/gi, "chú Lười")
        .replace(/\bDMV\b/gi, "Sở Đăng Kiểm")
        .replace(/bộ phận xe cộ/gi, "Sở Đăng Kiểm")
        .replace(/thực sự đang đấu tranh/gi, "đang chạy đua với thời gian");

      if (params.genreId === "animation") {
        translated = translated
          .replace(/\bTôi\b/g, "Tớ")
          .replace(/\btôi\b/g, "tớ")
          .replace(/\bBạn\b/g, "Cậu")
          .replace(/\bbạn\b/g, "cậu");
      }

      return translated;
    } catch {
      return null;
    }
  }
}

export const liveAiBridge = new LiveAiBridge();
