import crypto from "crypto";
import type WebSocketType from "isomorphic-ws";
import { liveAiBridge } from "@/server/providers/live-ai-bridge";

function getNodeWebSocket(): typeof WebSocketType {
  const req = eval("require") as NodeRequire;
  const wsMod = req("ws");
  return (wsMod.WebSocket || wsMod.default || wsMod) as typeof WebSocketType;
}

export type MouthVisemeCode = "A" | "O" | "E" | "U" | "MBP" | "REST";

export interface LipSyncWordCue {
  word: string;
  offsetMs: number;
  durationMs: number;
  viseme: MouthVisemeCode;
}

export interface NeuralSynthesisOutput {
  buffer: Buffer;
  dataUri: string;
  mimeType: string;
  neuralVoiceName: string;
  wordCues: LipSyncWordCue[];
}

export interface VoicePitchProfile {
  pitchMultiplier: number;
  edgeVoice: "vi-VN-HoaiMyNeural" | "vi-VN-NamMinhNeural";
  edgePitch: string;
  edgeRate: string;
  timbrePreset: "child_bright" | "female_clear" | "male_warm" | "male_deep";
  labelVi: string;
}

const ttsMemoryCache = new Map<string, NeuralSynthesisOutput>();

// ============================================================================
// Microsoft Edge Neural TTS Sec-MS-GEC v2 Token Generator (2-143.0.3650.75)
// ============================================================================
const TRUSTED_CLIENT_TOKEN = "6A5AA1D4EAFF4E9FB37E23D68491D6F4";
const CHROMIUM_FULL_VERSION = "143.0.3650.75";
const CHROMIUM_MAJOR_VERSION = "143";
const SEC_MS_GEC_VERSION = `2-${CHROMIUM_FULL_VERSION}`;
const WIN_EPOCH = 11644473600;
const U32 = 0xffffffffn;

const SHA256_INITIAL = [
  0x6a09e667n, 0xbb67ae85n, 0x3c6ef372n, 0xa54ff53an,
  0x510e527fn, 0x9b05688cn, 0x1f83d9abn, 0x5be0cd19n,
];
const SHA256_STATE = [
  0xfd9fbea2n, 0x91243ce7n, 0xbe499094n, 0xcd2e1e0an,
  0x6c006f49n, 0x04bd35abn, 0xfeb0a7e4n, 0x03effbd2n,
];
const SHA256_SCHEDULE = [
  0xeb24bf9en, 0x1558691fn, 0xa0c09ee2n, 0x0cfa32ban,
  0xa622ee8cn, 0xd1dd9491n, 0xc0dd25a0n, 0xf9e70ab6n,
  0xf0c31573n, 0x7058ce4en, 0x7188e606n, 0x00e5ab33n,
  0xd258b060n, 0x72766564n,
];
const SHA256_ROUND_CONSTANTS = [
  0x428a2f98n, 0x71374491n, 0xb5c0fbcfn, 0xe9b5dba5n, 0x3956c25bn, 0x59f111f1n, 0x923f82a4n, 0xab1c5ed5n,
  0xd807aa98n, 0x12835b01n, 0x243185ben, 0x550c7dc3n, 0x72be5d74n, 0x80deb1fen, 0x9bdc06a7n, 0xc19bf174n,
  0xe49b69c1n, 0xefbe4786n, 0x0fc19dc6n, 0x240ca1ccn, 0x2de92c6fn, 0x4a7484aan, 0x5cb0a9dcn, 0x76f988dan,
  0x983e5152n, 0xa831c66dn, 0xb00327c8n, 0xbf597fc7n, 0xc6e00bf3n, 0xd5a79147n, 0x06ca6351n, 0x14292967n,
  0x27b70a85n, 0x2e1b2138n, 0x4d2c6dfcn, 0x53380d13n, 0x650a7354n, 0x766a0abbn, 0x81c2c92en, 0x92722c85n,
  0xa2bfe8a1n, 0xa81a664bn, 0xc24b8b70n, 0xc76c51a3n, 0xd192e819n, 0xd6990624n, 0xf40e3585n, 0x106aa070n,
  0x19a4c116n, 0x1e376c08n, 0x2748774cn, 0x34b0bcb5n, 0x391c0cb3n, 0x4ed8aa4an, 0x5b9cca4fn, 0x682e6ff3n,
  0x748f82een, 0x78a5636fn, 0x84c87814n, 0x8cc70208n, 0x90befffan, 0xa4506cebn, 0xbef9a3f7n, 0xc67178f2n,
];
const SHA256_ADJUSTMENT = 0xc9dc06a7n;
const SHA256_BLOCK_CONSTANTS = [
  ...SHA256_ROUND_CONSTANTS.slice(0, 14),
  SHA256_ADJUSTMENT,
  ...SHA256_ROUND_CONSTANTS.slice(15),
];
const SHA256_SIGMA0_ADJ = 0x059c0b80n;
const SHA256_SIGMA1_ADJ = 0x000b92c0n;

const CS64_COEFFICIENTS: Array<[bigint, bigint]> = [
  [0xe82e91b1n, 0xb32700d0n], [0x44de24c6n, 0x88dff51dn],
  [0x3beb65bcn, 0x29514038n], [0xc89c5933n, 0xb328cbdfn],
  [0x8d1ec211n, 0xd405b4d5n], [0x314ef5d5n, 0x26e55f3cn],
  [0xe92491b1n, 0x607801c6n], [0xf0a5b9d5n, 0x82b2c1fbn],
  [0x06064cf3n, 0xfa51a3dan], [0xda79fa60n, 0x207cc464n],
  [0xbed20560n, 0x3c3c74f3n], [0x89f9c9f8n, 0xd2d14b61n],
  [0x35fa38c6n, 0xbb04a2c1n], [0xcb49e3c6n, 0xc5626167n],
];
const CS64_FACTOR = 0x82893933n;
const CS64_ADJ0 = 0xf2f90b1an;
const CS64_ADJ1 = 0x0b1a0000n;

function rol16(v: bigint): bigint {
  v &= U32;
  return ((v << 16n) | (v >> 16n)) & U32;
}
function rotr(v: bigint, n: bigint): bigint {
  v &= U32;
  return ((v >> n) | (v << (32n - n))) & U32;
}
function sigma0(v: bigint): bigint {
  v &= U32;
  return (rotr(v, 7n) ^ rotr(v, 18n) ^ (v >> 3n)) & U32;
}
function sigma1(v: bigint): bigint {
  v &= U32;
  return (rotr(v, 17n) ^ rotr(v, 19n) ^ (v >> 10n)) & U32;
}
function sha256Rounds(state: bigint[], words: bigint[], firstRound = 0): bigint[] {
  let [a, b, c, d, e, f, g, h] = state;
  const constants =
    firstRound === 14 ? SHA256_BLOCK_CONSTANTS : SHA256_ROUND_CONSTANTS;
  for (let i = firstRound; i < 64; i++) {
    const S1 = rotr(e, 6n) ^ rotr(e, 11n) ^ rotr(e, 25n);
    const ch = (e & f) ^ (~e & U32 & g);
    const t1 = (h + S1 + ch + constants[i] + words[i]) & U32;
    const S0 = rotr(a, 2n) ^ rotr(a, 13n) ^ rotr(a, 22n);
    const maj = (a & b) ^ (a & c) ^ (b & c);
    const t2 = (S0 + maj) & U32;
    h = g;
    g = f;
    f = e;
    e = (d + t1) & U32;
    d = c;
    c = b;
    b = a;
    a = (t1 + t2) & U32;
  }
  return [a, b, c, d, e, f, g, h];
}
function expandSchedule(words: bigint[], firstWord = 16): void {
  for (let i = firstWord; i < 64; i++) {
    words.push(
      (sigma1(words[i - 2]) +
        words[i - 7] +
        sigma0(words[i - 15]) +
        words[i - 16]) &
        U32
    );
  }
}
function sha256Init(data7: Buffer): bigint[] {
  const words: bigint[] = new Array(14).fill(0n);
  words.push(BigInt((data7[0] << 16) | (data7[1] << 8) | data7[2]));
  words.push(BigInt(data7.readUInt32BE(3)));
  for (let i = 16; i < 30; i++) {
    let val = SHA256_SCHEDULE[i - 16];
    if (i - 2 >= 14) {
      val +=
        i === 16
          ? sigma1(words[i - 2]) ^ SHA256_SIGMA1_ADJ
          : sigma1(words[i - 2]);
    }
    if (i - 7 >= 14) val += words[i - 7];
    if (i - 15 >= 14) {
      val +=
        i === 29
          ? sigma0(words[i - 15]) ^ SHA256_SIGMA0_ADJ
          : sigma0(words[i - 15]);
    }
    words.push(val & U32);
  }
  words.push(
    (sigma1(words[28]) +
      words[23] +
      sigma0(words[15]) +
      words[14] +
      SHA256_ADJUSTMENT -
      SHA256_ROUND_CONSTANTS[14]) &
      U32
  );
  expandSchedule(words, 31);
  const working = sha256Rounds(SHA256_STATE, words, 14);
  return SHA256_INITIAL.map((x, idx) => (x + working[idx]) & U32);
}
function sha256Digest(data: Buffer): Buffer {
  const len = 57 + data.length;
  const tail = data.subarray(7);
  const padZeroLen = (((55 - len) % 64) + 64) % 64;
  const lenBuf = Buffer.alloc(8);
  lenBuf.writeBigUInt64BE(BigInt(len * 8));
  const padded = Buffer.concat([
    tail,
    Buffer.from([0x80]),
    Buffer.alloc(padZeroLen),
    lenBuf,
  ]);
  let state = sha256Init(data.subarray(0, 7));
  for (let off = 0; off < padded.length; off += 64) {
    const words: bigint[] = [];
    for (let j = 0; j < 64; j += 4) {
      words.push(BigInt(padded.readUInt32BE(off + j)));
    }
    expandSchedule(words, 16);
    const working = sha256Rounds(state, words, 0);
    state = state.map((x, idx) => (x + working[idx]) & U32);
  }
  const out = Buffer.alloc(32);
  state.forEach((w, idx) => out.writeUInt32BE(Number(w), idx * 4));
  return out;
}
function wordsLe4Even(data: Buffer): bigint[] {
  const rem = (4 - (data.length % 4)) % 4;
  const padded = rem ? Buffer.concat([data, Buffer.alloc(rem)]) : data;
  const words: bigint[] = [];
  for (let i = 0; i < padded.length; i += 4) {
    words.push(BigInt(padded.readUInt32LE(i)));
  }
  if (words.length % 2 === 1) words.push(0n);
  return words;
}
function cs64Digest(data: Buffer, digest: Buffer): string {
  const keyA = BigInt(digest.readUInt32LE(0)) | 1n;
  const keyB = BigInt(digest.readUInt32LE(4)) | 1n;
  const factors = [(keyA * CS64_FACTOR) & U32, (keyB * CS64_FACTOR) & U32];
  const terms = CS64_COEFFICIENTS.map(([c], i) => (c * factors[i % 2]) & U32);
  const offsets = CS64_COEFFICIENTS.map(([, o]) => o);
  const extraWords = wordsLe4Even(Buffer.concat([Buffer.from([0x00]), data]));
  extraWords.forEach((word, idx) => {
    let term = word * (idx % 2 === 0 ? keyA : keyB);
    let offset = rol16(word) * (idx % 2 === 0 ? 0xef0569fbn : 0xc31713dbn);
    if (idx === 0) {
      term += CS64_ADJ0 * factors[0];
      offset += CS64_ADJ1;
    }
    terms.push(term & U32);
    offsets.push(offset & U32);
  });
  let swapAcc = 0n;
  let swapLast = 0n;
  let state = 0n;
  let acc = 0n;
  for (let i = 0; i < terms.length; i += 2) {
    const x = terms[i];
    const y = terms[i + 1];
    let t = rol16((offsets[i] + x) & U32);
    let q = (t * 0x76f50f34n) & U32;
    swapAcc += (rol16(q) * 0xc3efea97n + q) & U32;
    t = rol16((offsets[i + 1] + y) & U32);
    q = (t * 0x1881ce3cn) & U32;
    swapLast = (rol16(q) * 0x35bd1ec9n + q) & U32;
    swapAcc = (swapAcc + swapLast) & U32;

    state = (state * keyA + x) & U32;
    state = (rol16(state) * 0xcf98b111n) & U32;
    state = (rol16(state) * 0x87085b9fn) & U32;
    state = (rol16(state) * 0x12ceb96dn) & U32;
    state = (rol16(state) * 0x257e1d83n) & U32;
    acc += state;
    t = (state * keyB + y) & U32;
    t = (rol16(t) * 0xa27416f5n) & U32;
    t = (rol16(t) * 0xd38396ffn) & U32;
    state = (rol16((rol16(t) * 0x7c932b89n) & U32) * 0xbfa49f69n) & U32;
    acc = (acc + state) & U32;
  }
  const w0 = (swapLast ^ state) & U32;
  const w1 = (swapAcc ^ acc) & U32;
  const csBuf = Buffer.alloc(8);
  csBuf.writeUInt32LE(Number(w0), 0);
  csBuf.writeUInt32LE(Number(w1), 4);
  return csBuf.toString("hex").toUpperCase();
}

export function generateSecMsGecV2(unixSeconds = Date.now() / 1000): string {
  let ticks = Math.floor(unixSeconds) + WIN_EPOCH;
  ticks -= ticks % 300;
  const ticks100ns = BigInt(ticks) * 10000000n;
  const data = Buffer.from(
    `${ticks100ns.toString()}${TRUSTED_CLIENT_TOKEN}`,
    "ascii"
  );
  const digest = sha256Digest(data);
  const cs64 = cs64Digest(data, digest);
  return `${cs64}-${digest.toString("hex").toUpperCase()}`;
}

function escapeXml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

export function prepareNaturalSpokenVietnameseForTts(rawText: string): string {
  return (rawText || "")
    .replace(/^([A-Za-zÀ-ỹ0-9_]{1,18})\s*:\s*/u, "")
    .replace(/\(([^)]+)\)/g, ", $1")
    .replace(/\s*—\s*/g, ", ")
    .replace(/\s+\.\.\.\s+/g, "... ")
    .replace(/\s{2,}/g, " ")
    .trim();
}

export function getVoicePitchProfile(
  voiceId?: string | null,
  text?: string
): VoicePitchProfile {
  const id = (voiceId || "").toLowerCase();
  const content = (text || "").toLowerCase();

  // Detect slow character cadence (e.g. Flash the Sloth with ellipses)
  const isSlowSloth = /\.\.\..*\.\.\.|bạn hiền|tốt nhất có thể/i.test(content);

  if (isSlowSloth) {
    return {
      pitchMultiplier: 1.0,
      edgeVoice: "vi-VN-NamMinhNeural",
      edgePitch: "-2Hz",
      edgeRate: "-6%",
      timbrePreset: "male_deep",
      labelVi: "Nam trầm tự nhiên (Flash · NamMinhNeural Pure)",
    };
  }

  // Pure Formant Studio Tuning: Keep pitch within ±2Hz of natural human vocal tract
  // so neural vocoder NEVER sounds metallic, squeaky, or unstable across sentences.
  if (
    id.includes("bo_child") ||
    id.includes("bo_toon") ||
    id.includes("bo-child") ||
    id.includes("bo_")
  ) {
    return {
      pitchMultiplier: 1.0,
      edgeVoice: "vi-VN-HoaiMyNeural",
      edgePitch: "+2Hz",
      edgeRate: "+5%",
      timbrePreset: "child_bright",
      labelVi: "Nữ trẻ tự nhiên (Judy / Bé Bo · HoaiMyNeural Pure)",
    };
  }
  if (
    id.includes("vy_teen") ||
    id.includes("vy_toon") ||
    id.includes("vy-teen") ||
    id.includes("vy_")
  ) {
    return {
      pitchMultiplier: 1.0,
      edgeVoice: "vi-VN-NamMinhNeural",
      edgePitch: "+0Hz",
      edgeRate: "+5%",
      timbrePreset: "male_warm",
      labelVi: "Nam trẻ tự nhiên (Nick / Khôi · NamMinhNeural Pure)",
    };
  }
  if (id.includes("linh_young") || id.includes("linh")) {
    return {
      pitchMultiplier: 1.0,
      edgeVoice: "vi-VN-HoaiMyNeural",
      edgePitch: "+1Hz",
      edgeRate: "+4%",
      timbrePreset: "female_clear",
      labelVi: "Nữ trẻ truyền cảm (Linh · HoaiMyNeural Pure)",
    };
  }
  if (
    id.includes("ha_adult") ||
    id.includes("ha-female") ||
    id.includes("ha_female")
  ) {
    return {
      pitchMultiplier: 1.0,
      edgeVoice: "vi-VN-HoaiMyNeural",
      edgePitch: "-1Hz",
      edgeRate: "+3%",
      timbrePreset: "female_clear",
      labelVi: "Nữ đằm thắm (Hà · HoaiMyNeural Pure)",
    };
  }
  if (id.includes("quoc_neutral") || id.includes("quoc")) {
    return {
      pitchMultiplier: 1.0,
      edgeVoice: "vi-VN-NamMinhNeural",
      edgePitch: "+0Hz",
      edgeRate: "+4%",
      timbrePreset: "male_warm",
      labelVi: "Nam thuyết minh (Quốc · NamMinhNeural Pure)",
    };
  }
  if (id.includes("khoi_young") || id.includes("khoi")) {
    return {
      pitchMultiplier: 1.0,
      edgeVoice: "vi-VN-NamMinhNeural",
      edgePitch: "+1Hz",
      edgeRate: "+5%",
      timbrePreset: "male_warm",
      labelVi: "Nam trẻ năng động (Khôi · NamMinhNeural Pure)",
    };
  }
  if (id.includes("minh_adult") || id.includes("minh")) {
    return {
      pitchMultiplier: 1.0,
      edgeVoice: "vi-VN-NamMinhNeural",
      edgePitch: "-2Hz",
      edgeRate: "+3%",
      timbrePreset: "male_deep",
      labelVi: "Nam trầm điện ảnh (Minh · NamMinhNeural Pure)",
    };
  }
  if (
    id.includes("an_senior") ||
    id.includes("an-male") ||
    id.includes("an_male")
  ) {
    return {
      pitchMultiplier: 1.0,
      edgeVoice: "vi-VN-NamMinhNeural",
      edgePitch: "-3Hz",
      edgeRate: "+0%",
      timbrePreset: "male_deep",
      labelVi: "Nam điềm đạm (An · NamMinhNeural Pure)",
    };
  }
  if (id.includes("female")) {
    return {
      pitchMultiplier: 1.0,
      edgeVoice: "vi-VN-HoaiMyNeural",
      edgePitch: "+0Hz",
      edgeRate: "+4%",
      timbrePreset: "female_clear",
      labelVi: "Giọng Nữ Chuẩn Studio (HoaiMyNeural Pure)",
    };
  }
  return {
    pitchMultiplier: 1.0,
    edgeVoice: "vi-VN-NamMinhNeural",
    edgePitch: "+0Hz",
    edgeRate: "+4%",
    timbrePreset: "male_warm",
    labelVi: "Giọng Nam Chuẩn Studio (NamMinhNeural Pure)",
  };
}

export function classifyVietnameseWordViseme(word: string): MouthVisemeCode {
  const norm = word
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d")
    .replace(/[^a-z]/g, "");

  if (!norm) return "REST";
  if (/^(m|b|p)/.test(norm) || /(m|p)$/.test(norm)) {
    return "MBP";
  }
  if (/(o|oo|oa|oe)/.test(norm)) {
    return "O";
  }
  if (/(u|uu|uy)/.test(norm)) {
    return "U";
  }
  if (/(e|i|y)/.test(norm)) {
    return "E";
  }
  return "A";
}

export function buildFallbackLipSyncWordCues(
  text: string,
  totalDurationMs = 2400
): LipSyncWordCue[] {
  const words = text
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (words.length === 0) return [];
  const stepMs = Math.max(95, Math.floor(totalDurationMs / words.length));
  return words.map((word, idx) => ({
    word,
    offsetMs: idx * stepMs,
    durationMs: Math.max(80, stepMs - 10),
    viseme: classifyVietnameseWordViseme(word),
  }));
}

async function synthesizeViaEdgeNeuralV2(
  text: string,
  profile: VoicePitchProfile
): Promise<{ buffer: Buffer; wordCues: LipSyncWordCue[] } | null> {
  const secMsGec = generateSecMsGecV2(Date.now() / 1000);
  const connId = crypto.randomBytes(16).toString("hex");
  const muid = crypto.randomBytes(16).toString("hex").toUpperCase();
  const wsUrl = `wss://speech.platform.bing.com/consumer/speech/synthesize/readaloud/edge/v1?TrustedClientToken=${TRUSTED_CLIENT_TOKEN}&Sec-MS-GEC=${secMsGec}&Sec-MS-GEC-Version=${SEC_MS_GEC_VERSION}&ConnectionId=${connId}`;

  return new Promise((resolve) => {
    let settled = false;
    const finish = (
      val: { buffer: Buffer; wordCues: LipSyncWordCue[] } | null
    ) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeoutId);
      try {
        ws.close();
      } catch {
        // Ignore
      }
      resolve(val);
    };

    const timeoutId = setTimeout(() => finish(null), 5000);
    const audioChunks: Buffer[] = [];
    const wordCues: LipSyncWordCue[] = [];

    const NodeWebSocket = getNodeWebSocket();
    const ws = new NodeWebSocket(wsUrl, {
      headers: {
        Pragma: "no-cache",
        "Cache-Control": "no-cache",
        Origin: "chrome-extension://jdiccldimpdaibmpdkjnbmckianbfold",
        "Sec-WebSocket-Version": "13",
        "User-Agent": `Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${CHROMIUM_MAJOR_VERSION}.0.0.0 Safari/537.36 Edg/${CHROMIUM_MAJOR_VERSION}.0.0.0`,
        "Accept-Encoding": "gzip, deflate, br, zstd",
        "Accept-Language": "en-US,en;q=0.9",
        Cookie: `muid=${muid};`,
      },
    });

    ws.on("open", () => {
      const reqId = crypto.randomBytes(16).toString("hex");
      const nowIso = new Date().toISOString();
      ws.send(
        `X-Timestamp:${nowIso}\r\nContent-Type:application/json; charset=utf-8\r\nPath:speech.config\r\n\r\n{"context":{"synthesis":{"audio":{"metadataoptions":{"sentenceBoundaryEnabled":"false","wordBoundaryEnabled":"true"},"outputFormat":"audio-24khz-48kbitrate-mono-mp3"}}}}\r\n`
      );
      const ssml = `<speak version='1.0' xmlns='http://www.w3.org/2001/10/synthesis' xml:lang='vi-VN'><voice name='${profile.edgeVoice}'><prosody pitch='${profile.edgePitch}' rate='${profile.edgeRate}' volume='+5%'>${escapeXml(
        text
      )}</prosody></voice></speak>`;
      ws.send(
        `X-RequestId:${reqId}\r\nContent-Type:application/ssml+xml\r\nX-Timestamp:${nowIso}Z\r\nPath:ssml\r\n\r\n${ssml}`
      );
    });

    ws.on("message", (data: Buffer, isBinary: boolean) => {
      if (isBinary) {
        if (data.length < 2) return;
        const headerLen = data.readUInt16BE(0);
        if (data.length > headerLen + 2) {
          const headerStr = data.subarray(2, headerLen + 2).toString("utf8");
          if (headerStr.includes("Path:audio")) {
            audioChunks.push(data.subarray(headerLen + 2));
          }
        }
      } else {
        const textMsg = data.toString("utf8");
        if (textMsg.includes("Path:audio.metadata")) {
          const bodyIdx = textMsg.indexOf("\r\n\r\n");
          if (bodyIdx !== -1) {
            try {
              const metaJson = JSON.parse(textMsg.slice(bodyIdx + 4));
              for (const item of metaJson.Metadata || []) {
                if (item.Type === "WordBoundary" && item.Data?.text?.Text) {
                  const w = String(item.Data.text.Text);
                  wordCues.push({
                    word: w,
                    offsetMs: Math.round((item.Data.Offset || 0) / 10000),
                    durationMs: Math.max(
                      75,
                      Math.round((item.Data.Duration || 1000000) / 10000)
                    ),
                    viseme: classifyVietnameseWordViseme(w),
                  });
                }
              }
            } catch {
              // Ignore metadata parse errors
            }
          }
        } else if (textMsg.includes("Path:turn.end")) {
          if (audioChunks.length > 0) {
            finish({
              buffer: Buffer.concat(audioChunks),
              wordCues,
            });
          } else {
            finish(null);
          }
        }
      }
    });

    ws.on("unexpected-response", () => finish(null));
    ws.on("error", () => finish(null));
    ws.on("close", () => {
      if (audioChunks.length > 0) {
        finish({
          buffer: Buffer.concat(audioChunks),
          wordCues,
        });
      } else {
        finish(null);
      }
    });
  });
}

let lastThirdPartyTtsWarning: string | null = null;

export function getLastThirdPartyTtsWarning(): string | null {
  return lastThirdPartyTtsWarning;
}

async function synthesizeViaElevenLabs(
  text: string,
  profile: VoicePitchProfile,
  apiKey: string
): Promise<Buffer | null> {
  try {
    // Sarah (EXAVITQu4vr4xnSDxMaL) for Female/Child, George (JBFqnCBsd6RMkjVDRZzb) for Male (Universal Premade Voices)
    const isFemale = profile.edgeVoice === "vi-VN-HoaiMyNeural";
    const elevenVoiceId = isFemale
      ? "EXAVITQu4vr4xnSDxMaL"
      : "JBFqnCBsd6RMkjVDRZzb";

    const res = await fetch(
      `https://api.elevenlabs.io/v1/text-to-speech/${elevenVoiceId}`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "xi-api-key": apiKey,
        },
        body: JSON.stringify({
          text,
          model_id: "eleven_flash_v2_5",
          language_code: "vi",
          voice_settings: {
            stability: 0.5,
            similarity_boost: 0.8,
            style: 0.3,
            use_speaker_boost: true,
          },
        }),
      }
    );
    if (!res.ok) {
      const errBody = await res.text().catch(() => "");
      if (errBody.includes("missing_permissions") || errBody.includes("text_to_speech")) {
        lastThirdPartyTtsWarning =
          "Key ElevenLabs hiện đang bị tắt quyền 'Text to Speech' (missing_permissions). Vui lòng vào ElevenLabs -> Developers -> API Keys -> Edit Key và bật 'Text to Speech: Access' (hoặc tắt Restrict Key).";
      } else {
        lastThirdPartyTtsWarning = `ElevenLabs trả về mã ${res.status}: ${errBody.slice(0, 140)}`;
      }
      return null;
    }
    lastThirdPartyTtsWarning = null;
    const buf = Buffer.from(await res.arrayBuffer());
    return buf.byteLength > 256 ? buf : null;
  } catch {
    return null;
  }
}

async function synthesizeViaOpenAiTts(
  text: string,
  profile: VoicePitchProfile,
  apiKey: string
): Promise<Buffer | null> {
  try {
    const isFemale = profile.edgeVoice === "vi-VN-HoaiMyNeural";
    const openAiVoice = isFemale ? "nova" : "onyx";
    const res = await fetch("https://api.openai.com/v1/audio/speech", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: "gpt-4o-mini-tts",
        voice: openAiVoice,
        input: text,
        instructions:
          "Đọc bằng tiếng Việt chuẩn tự nhiên, giàu cảm xúc như diễn viên lồng tiếng phim chiếu rạp, ngắt nghỉ đúng dấu câu.",
        response_format: "mp3",
      }),
    });
    if (!res.ok) return null;
    const buf = Buffer.from(await res.arrayBuffer());
    return buf.byteLength > 256 ? buf : null;
  } catch {
    return null;
  }
}

async function synthesizeViaFptAi(
  text: string,
  profile: VoicePitchProfile,
  apiKey: string
): Promise<Buffer | null> {
  try {
    const isFemale = profile.edgeVoice === "vi-VN-HoaiMyNeural";
    const fptVoice = isFemale ? "banmai" : "leminh";
    const res = await fetch("https://api.fpt.ai/hmi/tts/v5", {
      method: "POST",
      headers: {
        "api-key": apiKey,
        voice: fptVoice,
        speed: "0",
        format: "mp3",
      },
      body: text,
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { async?: string };
    if (!data?.async) return null;

    // Poll async MP3 URL (FPT.AI generates short lines in ~400-800ms)
    for (let attempt = 0; attempt < 4; attempt++) {
      await new Promise((r) => setTimeout(r, 450));
      const audioRes = await fetch(data.async);
      if (audioRes.ok) {
        const buf = Buffer.from(await audioRes.arrayBuffer());
        if (buf.byteLength > 256) return buf;
      }
    }
    return null;
  } catch {
    return null;
  }
}

export class NeuralViTtsEngine {
  /**
   * Synthesizes real expressive Vietnamese neural speech (`audio/mpeg`)
   * using 3rd-party Studio Providers (ElevenLabs, FPT.AI, OpenAI Audio) when configured,
   * or Microsoft Edge Neural TTS (`vi-VN-HoaiMyNeural` & `vi-VN-NamMinhNeural`)
   * tuned to pure natural vocal tract formants (0Hz/+2Hz) with exact WordBoundary lip-sync cues.
   */
  public async synthesizeRealVietnameseMp3(
    text: string,
    voiceId?: string | null
  ): Promise<NeuralSynthesisOutput | null> {
    const cleaned = prepareNaturalSpokenVietnameseForTts(text);
    if (!cleaned) return null;

    const profile = getVoicePitchProfile(voiceId, cleaned);
    const activeKeys = liveAiBridge.getActiveKeys();
    const sysParams = liveAiBridge.getSystemParameters();
    const preferredTts = sysParams.preferredTtsProvider || "auto";

    const cacheKey = `ttsV3:${preferredTts}:${Boolean(
      activeKeys.elevenLabsApiKey
    )}:${Boolean(activeKeys.fptAiApiKey)}:${profile.edgeVoice}:${
      profile.edgePitch
    }:${profile.edgeRate}:${cleaned}`;

    if (ttsMemoryCache.has(cacheKey)) {
      return ttsMemoryCache.get(cacheKey)!;
    }

    // 1. Try ElevenLabs Flash v2.5 / Multilingual v2 if configured
    if (
      activeKeys.elevenLabsApiKey &&
      (preferredTts === "auto" || preferredTts === "elevenlabs")
    ) {
      const elevenBuf = await synthesizeViaElevenLabs(
        cleaned,
        profile,
        activeKeys.elevenLabsApiKey
      );
      if (elevenBuf) {
        const out: NeuralSynthesisOutput = {
          buffer: elevenBuf,
          dataUri: `data:audio/mpeg;base64,${elevenBuf.toString("base64")}`,
          mimeType: "audio/mpeg",
          neuralVoiceName: `ElevenLabs Flash v2.5 (${profile.labelVi})`,
          wordCues: buildFallbackLipSyncWordCues(cleaned),
        };
        ttsMemoryCache.set(cacheKey, out);
        return out;
      }
    }

    // 2. Try FPT.AI Vietnamese Broadcast Studio TTS if configured
    if (
      activeKeys.fptAiApiKey &&
      (preferredTts === "auto" || preferredTts === "fpt_ai")
    ) {
      const fptBuf = await synthesizeViaFptAi(
        cleaned,
        profile,
        activeKeys.fptAiApiKey
      );
      if (fptBuf) {
        const out: NeuralSynthesisOutput = {
          buffer: fptBuf,
          dataUri: `data:audio/mpeg;base64,${fptBuf.toString("base64")}`,
          mimeType: "audio/mpeg",
          neuralVoiceName: `FPT.AI Studio (${
            profile.edgeVoice === "vi-VN-HoaiMyNeural"
              ? "Ban Mai"
              : "Lê Minh"
          })`,
          wordCues: buildFallbackLipSyncWordCues(cleaned),
        };
        ttsMemoryCache.set(cacheKey, out);
        return out;
      }
    }

    // 3. Try OpenAI gpt-4o-mini-tts if explicitly selected and key is present
    if (activeKeys.openAiApiKey && preferredTts === "openai_tts") {
      const oaiBuf = await synthesizeViaOpenAiTts(
        cleaned,
        profile,
        activeKeys.openAiApiKey
      );
      if (oaiBuf) {
        const out: NeuralSynthesisOutput = {
          buffer: oaiBuf,
          dataUri: `data:audio/mpeg;base64,${oaiBuf.toString("base64")}`,
          mimeType: "audio/mpeg",
          neuralVoiceName: `OpenAI gpt-4o-mini-tts (${
            profile.edgeVoice === "vi-VN-HoaiMyNeural" ? "Nova" : "Onyx"
          })`,
          wordCues: buildFallbackLipSyncWordCues(cleaned),
        };
        ttsMemoryCache.set(cacheKey, out);
        return out;
      }
    }

    // 4. Primary Pure-Formant Neural Engine: Microsoft Edge Neural v2 (HoaiMyNeural & NamMinhNeural 24kHz)
    let edgeOut = await synthesizeViaEdgeNeuralV2(cleaned, profile);
    if (!edgeOut || edgeOut.buffer.byteLength <= 256) {
      await new Promise((r) => setTimeout(r, 150));
      edgeOut = await synthesizeViaEdgeNeuralV2(cleaned, profile);
    }
    if (edgeOut && edgeOut.buffer.byteLength > 256) {
      const output: NeuralSynthesisOutput = {
        buffer: edgeOut.buffer,
        dataUri: `data:audio/mpeg;base64,${edgeOut.buffer.toString("base64")}`,
        mimeType: "audio/mpeg",
        neuralVoiceName: `${profile.edgeVoice} Pure (${profile.edgePitch}, ${profile.edgeRate})`,
        wordCues:
          edgeOut.wordCues.length > 0
            ? edgeOut.wordCues
            : buildFallbackLipSyncWordCues(cleaned),
      };

      if (ttsMemoryCache.size > 300) {
        const firstKey = ttsMemoryCache.keys().next().value;
        if (firstKey) ttsMemoryCache.delete(firstKey);
      }
      ttsMemoryCache.set(cacheKey, output);
      return output;
    }

    // Secondary Cloud Redundancy: Google GTX Vietnamese Neural TTS (24kHz MP3)
    try {
      const gtxUrl = `https://translate.googleapis.com/translate_tts?ie=UTF-8&tl=vi&client=gtx&q=${encodeURIComponent(
        cleaned.slice(0, 195)
      )}`;
      const res = await fetch(gtxUrl, {
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
        },
      });
      if (res.ok) {
        const buf = Buffer.from(await res.arrayBuffer());
        if (buf.byteLength > 256) {
          const fallbackOutput: NeuralSynthesisOutput = {
            buffer: buf,
            dataUri: `data:audio/mpeg;base64,${buf.toString("base64")}`,
            mimeType: "audio/mpeg",
            neuralVoiceName: `${profile.labelVi} (Cloud Backup)`,
            wordCues: buildFallbackLipSyncWordCues(cleaned),
          };
          ttsMemoryCache.set(cacheKey, fallbackOutput);
          return fallbackOutput;
        }
      }
    } catch {
      // Ignore
    }

    return null;
  }
}

export const neuralViTtsEngine = new NeuralViTtsEngine();
