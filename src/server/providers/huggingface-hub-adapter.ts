export interface HuggingFaceModelSpec {
  stage: "asr" | "diarization" | "translation" | "tts";
  modelId: string;
  repoUrl: string;
  task: string;
  roleDescriptionVi: string;
  inferenceMode: "serverless_inference_api" | "dedicated_endpoint_or_local";
  isDefaultForStage: boolean;
}

export const HUGGING_FACE_DUBBING_MODELS: HuggingFaceModelSpec[] = [
  // 1. ASR (Speech-to-Text)
  {
    stage: "asr",
    modelId: "openai/whisper-large-v3-turbo",
    repoUrl: "https://huggingface.co/openai/whisper-large-v3-turbo",
    task: "automatic-speech-recognition",
    roleDescriptionVi:
      "Nhận diện giọng nói đa ngôn ngữ tốc độ cao với word/segment timestamps chính xác.",
    inferenceMode: "serverless_inference_api",
    isDefaultForStage: true,
  },
  {
    stage: "asr",
    modelId: "vinai/PhoWhisper-large",
    repoUrl: "https://huggingface.co/vinai/PhoWhisper-large",
    task: "automatic-speech-recognition",
    roleDescriptionVi:
      "Mô hình ASR chuyên biệt cho tiếng Việt và nội dung song ngữ Việt-Anh từ VinAI.",
    inferenceMode: "serverless_inference_api",
    isDefaultForStage: false,
  },

  // 2. Speaker Diarization (Phân tách người nói)
  {
    stage: "diarization",
    modelId: "pyannote/speaker-diarization-3.1",
    repoUrl: "https://huggingface.co/pyannote/speaker-diarization-3.1",
    task: "speaker-diarization",
    roleDescriptionVi:
      "Phân tách từng nhân vật (SPEAKER_00, SPEAKER_01...) và phát hiện đoạn hội thoại chồng lấp.",
    inferenceMode: "dedicated_endpoint_or_local",
    isDefaultForStage: true,
  },
  {
    stage: "diarization",
    modelId: "pyannote/wespeaker-voxceleb-resnet34-LM",
    repoUrl: "https://huggingface.co/pyannote/wespeaker-voxceleb-resnet34-LM",
    task: "speaker-embedding",
    roleDescriptionVi:
      "Trích xuất vector đặc trưng giọng nói (speaker embedding) phục vụ AI Casting theo nhân vật.",
    inferenceMode: "dedicated_endpoint_or_local",
    isDefaultForStage: false,
  },

  // 3. Context Translation (Dịch hội thoại ngữ cảnh sang Tiếng Việt)
  {
    stage: "translation",
    modelId: "Qwen/Qwen2.5-72B-Instruct",
    repoUrl: "https://huggingface.co/Qwen/Qwen2.5-72B-Instruct",
    task: "text-generation",
    roleDescriptionVi:
      "LLM mã nguồn mở dịch hội thoại theo cửa sổ ngữ cảnh, giữ nhất quán đại từ nhân xưng tiếng Việt (anh/em/tôi/bạn) và độ dài câu thoại cho lồng tiếng.",
    inferenceMode: "serverless_inference_api",
    isDefaultForStage: true,
  },
  {
    stage: "translation",
    modelId: "facebook/nllb-200-distilled-600M",
    repoUrl: "https://huggingface.co/facebook/nllb-200-distilled-600M",
    task: "translation",
    roleDescriptionVi:
      "Mô hình dịch máy đa ngôn ngữ NLLB-200 (eng_Latn -> vie_Latn) tốc độ cao dùng làm fallback.",
    inferenceMode: "serverless_inference_api",
    isDefaultForStage: false,
  },

  // 4. Vietnamese Multi-Speaker TTS (Tổng hợp giọng đọc Tiếng Việt)
  {
    stage: "tts",
    modelId: "facebook/mms-tts-vie",
    repoUrl: "https://huggingface.co/facebook/mms-tts-vie",
    task: "text-to-speech",
    roleDescriptionVi:
      "Mô hình Meta Massively Multilingual Speech (MMS-TTS) tiếng Việt hỗ trợ trực tiếp trên Hugging Face Inference API.",
    inferenceMode: "serverless_inference_api",
    isDefaultForStage: true,
  },
  {
    stage: "tts",
    modelId: "hynt/F5-TTS-Vietnamese-ViVoice",
    repoUrl: "https://huggingface.co/hynt/F5-TTS-Vietnamese-ViVoice",
    task: "text-to-speech",
    roleDescriptionVi:
      "Mô hình F5-TTS huấn luyện trên tập dữ liệu ViVoice tiếng Việt tự nhiên, giàu cảm xúc cho từng vai nhân vật.",
    inferenceMode: "dedicated_endpoint_or_local",
    isDefaultForStage: false,
  },
  {
    stage: "tts",
    modelId: "capleaf/viXTTS",
    repoUrl: "https://huggingface.co/capleaf/viXTTS",
    task: "text-to-speech",
    roleDescriptionVi:
      "Mô hình XTTS-v2 tinh chỉnh cho tiếng Việt, hỗ trợ đa nhân vật và điều chỉnh ngữ điệu phòng thu.",
    inferenceMode: "dedicated_endpoint_or_local",
    isDefaultForStage: false,
  },
];

export class HuggingFaceHubAdapter {
  private readonly apiToken: string | null;
  private readonly inferenceBaseUrl: string;

  constructor(options?: { apiToken?: string | null; inferenceBaseUrl?: string }) {
    this.apiToken =
      options?.apiToken !== undefined
        ? options.apiToken
        : process.env.HUGGINGFACE_API_KEY || process.env.HF_TOKEN || null;
    this.inferenceBaseUrl = (
      options?.inferenceBaseUrl ??
      "https://router.huggingface.co/hf-inference/models"
    ).replace(/\/+$/, "");
  }

  public isRemoteInferenceConfigured(): boolean {
    return Boolean(this.apiToken && this.apiToken.trim().length > 0);
  }

  public getModelCatalog() {
    return {
      hubUrl: "https://huggingface.co",
      remoteInferenceEnabled: this.isRemoteInferenceConfigured(),
      fallbackEngine: "studio-deterministic-local-adapter",
      models: HUGGING_FACE_DUBBING_MODELS,
    };
  }

  public getDefaultModelForStage(
    stage: HuggingFaceModelSpec["stage"]
  ): HuggingFaceModelSpec {
    return (
      HUGGING_FACE_DUBBING_MODELS.find(
        (m) => m.stage === stage && m.isDefaultForStage
      ) ?? HUGGING_FACE_DUBBING_MODELS[0]
    );
  }

  public buildInferenceEndpointUrl(modelId: string): string {
    return `${this.inferenceBaseUrl}/${modelId}`;
  }
}

export const huggingFaceHubAdapter = new HuggingFaceHubAdapter();
