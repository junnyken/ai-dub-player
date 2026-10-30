export function createValidMp4Buffer(options?: {
  durationSeconds?: number;
  timescale?: number;
  includeAudioTrack?: boolean;
}): Buffer {
  const durationSeconds = options?.durationSeconds ?? 125; // 2m 5s -> 3 credits
  const timescale = options?.timescale ?? 1000;
  const includeAudioTrack = options?.includeAudioTrack ?? true;
  const durationUnits = durationSeconds * timescale;

  // ftyp box (20 bytes)
  const ftyp = Buffer.alloc(20);
  ftyp.writeUInt32BE(20, 0);
  ftyp.write("ftyp", 4, "ascii");
  ftyp.write("isom", 8, "ascii");
  ftyp.writeUInt32BE(512, 12);
  ftyp.write("isom", 16, "ascii");

  // mvhd box (version 0: 32 bytes)
  const mvhd = Buffer.alloc(32);
  mvhd.writeUInt32BE(32, 0);
  mvhd.write("mvhd", 4, "ascii");
  mvhd.writeUInt8(0, 8); // version 0 inside mvhd payload (offset 4 from 'mvhd' start = index 8)
  mvhd.writeUInt32BE(timescale, 20); // mvhdIndex (4) + 16 = 20
  mvhd.writeUInt32BE(durationUnits, 24); // mvhdIndex (4) + 20 = 24

  // hdlr box with 'soun' or 'vide' (24 bytes)
  const hdlr = Buffer.alloc(24);
  hdlr.writeUInt32BE(24, 0);
  hdlr.write("hdlr", 4, "ascii");
  hdlr.write(includeAudioTrack ? "soun" : "vide", 12, "ascii");

  // moov container header (8 bytes)
  const moovSize = 8 + mvhd.byteLength + hdlr.byteLength;
  const moovHeader = Buffer.alloc(8);
  moovHeader.writeUInt32BE(moovSize, 0);
  moovHeader.write("moov", 4, "ascii");

  return Buffer.concat([ftyp, moovHeader, mvhd, hdlr]);
}

export function createValidWavBuffer(durationSeconds = 180): Buffer {
  const byteRate = 32000; // 16kHz 16-bit mono
  const declaredDataSize = durationSeconds * byteRate;

  const header = Buffer.alloc(44);
  header.write("RIFF", 0, "ascii");
  header.writeUInt32LE(36 + declaredDataSize, 4);
  header.write("WAVE", 8, "ascii");
  header.write("fmt ", 12, "ascii");
  header.writeUInt32LE(16, 16); // PCM chunk size
  header.writeUInt16LE(1, 20); // PCM format
  header.writeUInt16LE(1, 22); // 1 channel
  header.writeUInt32LE(16000, 24); // Sample rate
  header.writeUInt32LE(byteRate, 28); // Byte rate (fmtIndex 12 + 16 = 28)
  header.writeUInt16LE(2, 32); // Block align
  header.writeUInt16LE(16, 34); // Bits per sample
  header.write("data", 36, "ascii");
  header.writeUInt32LE(declaredDataSize, 40);

  const samplePayload = Buffer.alloc(256, 0x10);
  return Buffer.concat([header, samplePayload]);
}
