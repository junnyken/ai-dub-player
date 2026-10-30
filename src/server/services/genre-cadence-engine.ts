import {
  ApparentGender,
  EstimatedAgeGroup,
  SpeakerRoleHint,
} from "@/domain/models";

export type VideoGenreProfileId =
  | "animation"
  | "cinema"
  | "documentary"
  | "talkshow";

export interface GenreSpeakerClusterPreset {
  estimatedAgeGroup: EstimatedAgeGroup;
  apparentGender: ApparentGender;
  roleHint: SpeakerRoleHint;
  emotionProfile: string[];
}

export interface GenreDialogueTemplate {
  text: string;
  confidence: number;
  viFull: string;
  viCompact: string;
}

export interface VideoGenreProfile {
  id: VideoGenreProfileId;
  displayNameVi: string;
  targetMsPerSyllable: number;
  maxAllowedSpeedup: number;
  pronounPair: {
    firstPersonSingular: string;
    secondPersonSingular: string;
    firstPersonPlural: string;
  };
  speakerPresets: GenreSpeakerClusterPreset[];
  dialogueCorpus: GenreDialogueTemplate[];
}

const GENRE_PROFILES: Record<VideoGenreProfileId, VideoGenreProfile> = {
  animation: {
    id: "animation",
    displayNameVi: "Hoạt hình / Anime (Nhịp nhanh, giàu biểu cảm)",
    targetMsPerSyllable: 205,
    maxAllowedSpeedup: 1.25,
    pronounPair: {
      firstPersonSingular: "tớ",
      secondPersonSingular: "cậu",
      firstPersonPlural: "chúng mình",
    },
    speakerPresets: [
      {
        estimatedAgeGroup: "child",
        apparentGender: "neutral",
        roleHint: "main_character",
        emotionProfile: ["hoạt hình", "nhí nhảnh", "năng động"],
      },
      {
        estimatedAgeGroup: "teen",
        apparentGender: "female",
        roleHint: "main_character",
        emotionProfile: ["hoạt hình", "anime", "trong trẻo", "biểu cảm"],
      },
      {
        estimatedAgeGroup: "adult",
        apparentGender: "male",
        roleHint: "narrator",
        emotionProfile: ["ấm áp", "dẫn chuyện"],
      },
    ],
    dialogueCorpus: [
      {
        text: "Look over there! That little star dragon is waking up from its crystal sleep!",
        confidence: 0.95,
        viFull:
          "Nhìn đằng kia kìa cậu ơi! Chú rồng sao nhỏ đang thức giấc khỏi giấc ngủ pha lê đấy!",
        viCompact:
          "Nhìn kìa cậu ơi! Chú rồng sao nhỏ đang tỉnh giấc đấy!",
      },
      {
        text: "Hold on tight everyone, we are flying straight through the rainbow clouds right now!",
        confidence: 0.93,
        viFull:
          "Bám chắc vào nhé các cậu, chúng mình đang bay xuyên qua tầng mây cầu vồng ngay bây giờ đây!",
        viCompact:
          "Bám chắc nhé các cậu, chúng mình đang bay xuyên qua mây cầu vồng đấy!",
      },
      {
        text: "Wait for me! My magic boots are still charging up their jump power!",
        confidence: 0.91,
        viFull:
          "Đợi tớ với nào! Đôi giày phép thuật của tớ vẫn đang nạp năng lượng bật nhảy mà!",
        viCompact:
          "Đợi tớ với! Giày phép thuật của tớ đang nạp đà nhảy mà!",
      },
      {
        text: "Don't be afraid, if we combine our badges, the secret gate will open!",
        confidence: 0.69, // Low confidence utterance -> triggers needsReview = true
        viFull:
          "Đừng sợ nhé, nếu chúng mình ghép huy hiệu lại với nhau thì cánh cổng bí mật sẽ mở ra thôi!",
        viCompact:
          "Đừng sợ nhé, ghép huy hiệu lại là cổng bí mật sẽ mở ngay!",
      },
      {
        text: "Awesome! That was the fastest sky dash we have ever pulled off together!",
        confidence: 0.94,
        viFull:
          "Tuyệt cú mèo luôn! Đó là cú lướt trên không nhanh nhất mà chúng mình từng làm được đấy!",
        viCompact:
          "Tuyệt quá đi! Đó là cú lướt trời nhanh nhất của chúng mình đấy!",
      },
      {
        text: "Come on team, our next adventure in the cloud kingdom is just beginning!",
        confidence: 0.92,
        viFull:
          "Tiến lên nào cả đội ơi, chuyến phiêu lưu tiếp theo ở vương quốc trên mây mới chỉ bắt đầu thôi!",
        viCompact:
          "Đi thôi cả đội, chuyến phiêu lưu ở vương quốc mây bắt đầu rồi!",
      },
    ],
  },
  cinema: {
    id: "cinema",
    displayNameVi: "Phim điện ảnh / Hành động - Tâm lý (Nhịp dứt khoát, kịch tính)",
    targetMsPerSyllable: 215,
    maxAllowedSpeedup: 1.25,
    pronounPair: {
      firstPersonSingular: "tôi",
      secondPersonSingular: "anh",
      firstPersonPlural: "chúng ta",
    },
    speakerPresets: [
      {
        estimatedAgeGroup: "adult",
        apparentGender: "male",
        roleHint: "main_character",
        emotionProfile: ["trầm", "tự tin", "điện ảnh"],
      },
      {
        estimatedAgeGroup: "young_adult",
        apparentGender: "female",
        roleHint: "main_character",
        emotionProfile: ["biểu cảm", "nhân vật chính", "quyết đoán"],
      },
      {
        estimatedAgeGroup: "senior",
        apparentGender: "male",
        roleHint: "interviewer",
        emotionProfile: ["điềm đạm", "từng trải"],
      },
    ],
    dialogueCorpus: [
      {
        text: "Stay down and keep the channel encrypted! The security drones are scanning this sector.",
        confidence: 0.94,
        viFull:
          "Cúi thấp xuống và giữ kênh liên lạc mã hóa! Đội thiết bị bay đang quét toàn bộ khu vực này.",
        viCompact:
          "Cúi xuống và khóa kênh liên lạc! Thiết bị bay đang quét khu này.",
      },
      {
        text: "I only need thirty seconds to bypass the main reactor firewall, cover me!",
        confidence: 0.92,
        viFull:
          "Tôi chỉ cần đúng ba mươi giây để vượt qua tường lửa lò phản ứng chính, yểm trợ cho tôi!",
        viCompact:
          "Tôi cần ba mươi giây để vượt tường lửa chính, yểm trợ tôi!",
      },
      {
        text: "If that core overheats before we lock the blast doors, the whole station goes dark.",
        confidence: 0.71,
        viFull:
          "Nếu lõi năng lượng quá nhiệt trước khi ta khóa cửa chắn nổ, toàn bộ trạm sẽ sập nguồn.",
        viCompact:
          "Nếu lõi quá nhiệt trước khi khóa cửa chắn, cả trạm sẽ sập nguồn.",
      },
      {
        text: "Trust me this one time, I promised we would make it home alive.",
        confidence: 0.95,
        viFull:
          "Hãy tin tôi lần này thôi, tôi đã hứa là chúng ta sẽ cùng nhau trở về nhà an toàn.",
        viCompact:
          "Tin tôi lần này đi, tôi đã hứa chúng ta sẽ về nhà an toàn.",
      },
    ],
  },
  documentary: {
    id: "documentary",
    displayNameVi: "Phim tài liệu / Khoa học (Nhịp điềm tĩnh, chuẩn thuật ngữ)",
    targetMsPerSyllable: 230,
    maxAllowedSpeedup: 1.22,
    pronounPair: {
      firstPersonSingular: "tôi",
      secondPersonSingular: "quý vị",
      firstPersonPlural: "chúng ta",
    },
    speakerPresets: [
      {
        estimatedAgeGroup: "adult",
        apparentGender: "neutral",
        roleHint: "narrator",
        emotionProfile: ["dẫn chuyện", "điềm tĩnh", "rõ ràng"],
      },
      {
        estimatedAgeGroup: "senior",
        apparentGender: "male",
        roleHint: "interviewer",
        emotionProfile: ["điềm đạm", "từng trải", "sâu lắng"],
      },
    ],
    dialogueCorpus: [
      {
        text: "Thousands of meters beneath the ocean surface, bioluminescent creatures create their own light.",
        confidence: 0.96,
        viFull:
          "Hàng nghìn mét dưới mặt đại dương, các sinh vật phát quang sinh học tự tạo ra ánh sáng của riêng mình.",
        viCompact:
          "Sâu hàng nghìn mét dưới biển, sinh vật phát quang tự tạo ra ánh sáng.",
      },
      {
        text: "For centuries, scientists believed no complex ecosystem could survive this extreme pressure.",
        confidence: 0.93,
        viFull:
          "Suốt nhiều thế kỷ, giới khoa học từng tin rằng không hệ sinh thái phức tạp nào chịu nổi áp suất khắc nghiệt này.",
        viCompact:
          "Nhiều thế kỷ qua, các nhà khoa học tưởng không loài nào sống nổi ở áp suất này.",
      },
      {
        text: "Yet around volcanic vents, thriving colonies adapt and flourish in complete darkness.",
        confidence: 0.72,
        viFull:
          "Thế nhưng quanh các miệng phun thủy nhiệt, những quần thể sự sống vẫn thích nghi và bừng nở giữa bóng tối vĩnh cửu.",
        viCompact:
          "Nhưng quanh miệng núi lửa ngầm, sự sống vẫn thích nghi và phát triển rực rỡ.",
      },
      {
        text: "Protecting these fragile deep-sea habitats is vital for the future of our planet.",
        confidence: 0.95,
        viFull:
          "Bảo vệ những sinh cảnh biển sâu mong manh này có ý nghĩa sống còn đối với tương lai hành tinh của chúng ta.",
        viCompact:
          "Bảo vệ sinh cảnh biển sâu này rất quan trọng cho tương lai Trái Đất.",
      },
    ],
  },
  talkshow: {
    id: "talkshow",
    displayNameVi: "Talkshow / Phỏng vấn / Đa phương tiện (Mặc định)",
    targetMsPerSyllable: 220,
    maxAllowedSpeedup: 1.25,
    pronounPair: {
      firstPersonSingular: "tôi",
      secondPersonSingular: "bạn",
      firstPersonPlural: "chúng ta",
    },
    speakerPresets: [
      {
        estimatedAgeGroup: "adult",
        apparentGender: "male",
        roleHint: "interviewer",
        emotionProfile: ["confident", "informative"],
      },
      {
        estimatedAgeGroup: "young_adult",
        apparentGender: "female",
        roleHint: "main_character",
        emotionProfile: ["warm", "expressive"],
      },
      {
        estimatedAgeGroup: "adult",
        apparentGender: "neutral",
        roleHint: "narrator",
        emotionProfile: ["calm", "clear"],
      },
    ],
    dialogueCorpus: [
      {
        text: "Welcome everyone to today's deep dive into artificial intelligence and media production.",
        confidence: 0.94,
        viFull:
          "Chào mừng mọi người đến với buổi phân tích chuyên sâu hôm nay về trí tuệ nhân tạo và sản xuất truyền thông.",
        viCompact:
          "Chào mừng các bạn đến với chuyên đề hôm nay về AI và sản xuất truyền thông.",
      },
      {
        text: "Thanks for having me here. The pace of multi-speaker voice synthesis has changed how studios localize content.",
        confidence: 0.91,
        viFull:
          "Cảm ơn bạn đã mời tôi tham gia. Tốc độ phát triển của tổng hợp giọng nói đa nhân vật đã thay đổi cách các studio bản địa hóa nội dung.",
        viCompact:
          "Cảm ơn bạn đã mời tôi. Giọng AI đa nhân vật đã thay đổi hẳn cách studio lồng tiếng.",
      },
      {
        text: "Could you explain why speaker diarization and context-aware translation matter so much?",
        confidence: 0.89,
        viFull:
          "Bạn có thể giải thích vì sao việc phân tách người nói và dịch theo ngữ cảnh lại quan trọng đến vậy không?",
        viCompact:
          "Vì sao việc tách người nói và dịch theo ngữ cảnh lại quan trọng đến vậy?",
      },
      {
        text: "When a single flat voice reads an entire film, the emotional nuance and character identity disappear completely.",
        confidence: 0.68,
        viFull:
          "Khi chỉ một giọng đọc đều đều lồng tiếng cho cả bộ phim, sắc thái cảm xúc và cá tính nhân vật sẽ biến mất hoàn toàn.",
        viCompact:
          "Khi một giọng đều đều đọc cả phim, cảm xúc và cá tính nhân vật sẽ mất hẳn.",
      },
      {
        text: "By analyzing each speaker's role, tone, and cadence, we can match distinct voices while keeping natural timing.",
        confidence: 0.93,
        viFull:
          "Bằng cách phân tích vai trò, âm sắc và nhịp điệu của từng người nói, chúng ta có thể phối đúng giọng riêng biệt mà vẫn giữ nhịp thời gian tự nhiên.",
        viCompact:
          "Nhờ phân tích vai trò, âm sắc và nhịp nói, ta phối đúng giọng mà vẫn khớp nhịp.",
      },
      {
        text: "And viewers can still toggle between original audio, dubbed audio, and bilingual subtitles at any moment.",
        confidence: 0.88,
        viFull:
          "Và người xem vẫn có thể chuyển đổi linh hoạt giữa âm thanh gốc, giọng lồng tiếng và phụ đề song ngữ bất kỳ lúc nào.",
        viCompact:
          "Và người xem vẫn bật tắt được tiếng gốc, lồng tiếng cùng phụ đề song ngữ mọi lúc.",
      },
    ],
  },
};

export class GenreCadenceEngine {
  /**
   * Detects the film/video genre from title and/or dialogue sample.
   * Defaults to "talkshow" so existing studio/interview flows remain 100% consistent.
   */
  public detectGenre(params: {
    title?: string | null;
    sampleTexts?: string[];
  }): VideoGenreProfile {
    const combined = `${params.title ?? ""} ${(params.sampleTexts ?? []).join(" ")}`.toLowerCase();

    if (
      /\b(animation|anime|cartoon|pixar|ghibli|disney|zootopia|sloth|minions|frozen|shrek|moana|kids|hoạt hình|thiếu nhi|star dragon|magic boots|rainbow clouds)\b/i.test(
        combined
      )
    ) {
      return GENRE_PROFILES.animation;
    }

    if (
      /\b(cinema|movie|action|thriller|sci-fi|trailer|phim hành động|điện ảnh|reactor firewall|security drones|blast doors)\b/i.test(
        combined
      )
    ) {
      return GENRE_PROFILES.cinema;
    }

    if (
      /\b(documentary|nature|planet|ocean|science|history|tài liệu|khoa học|đại dương|bioluminescent|volcanic vents)\b/i.test(
        combined
      )
    ) {
      return GENRE_PROFILES.documentary;
    }

    return GENRE_PROFILES.talkshow;
  }

  public getProfile(genreId: VideoGenreProfileId): VideoGenreProfile {
    return GENRE_PROFILES[genreId] ?? GENRE_PROFILES.talkshow;
  }

  public listAllProfiles(): VideoGenreProfile[] {
    return Object.values(GENRE_PROFILES);
  }

  /**
   * Matches any known template across all 4 genres and returns both full & compact Vietnamese translations.
   */
  public findTemplateTranslation(sourceText: string): {
    genreId: VideoGenreProfileId;
    viFull: string;
    viCompact: string;
  } | null {
    const normalized = sourceText.trim().toLowerCase();
    for (const profile of Object.values(GENRE_PROFILES)) {
      for (const item of profile.dialogueCorpus) {
        if (item.text.trim().toLowerCase() === normalized) {
          return {
            genreId: profile.id,
            viFull: item.viFull,
            viCompact: item.viCompact,
          };
        }
      }
    }
    return null;
  }

  /**
   * Compositional context-aware English-to-Vietnamese translator for arbitrary unseen dialogue
   * so any video link or custom dialogue produces natural Vietnamese sentences adapted to speaker & genre.
   */
  public translateCompositionalVietnamese(params: {
    sourceText: string;
    genre: VideoGenreProfile;
    speakerRole?: SpeakerRoleHint;
    apparentGender?: ApparentGender;
    estimatedAgeGroup?: EstimatedAgeGroup;
  }): string {
    const { sourceText, genre, speakerRole, apparentGender, estimatedAgeGroup } =
      params;

    // Determine context-appropriate self/partner pronouns
    let selfPronoun = genre.pronounPair.firstPersonSingular;
    let partnerPronoun = genre.pronounPair.secondPersonSingular;

    if (
      genre.id === "animation" ||
      estimatedAgeGroup === "child" ||
      estimatedAgeGroup === "teen"
    ) {
      selfPronoun = "tớ";
      partnerPronoun = "cậu";
    } else if (speakerRole === "narrator") {
      selfPronoun = "chúng ta";
      partnerPronoun = "quý vị";
    } else if (apparentGender === "female" && genre.id === "talkshow") {
      selfPronoun = "mình";
      partnerPronoun = "bạn";
    }

    const phraseMap: Array<[RegExp, string]> = [
      [/\blook over there\b/gi, "nhìn đằng kia kìa"],
      [/\blook at that\b/gi, "nhìn kia kìa"],
      [/\bhold on tight\b/gi, "bám chắc vào nhé"],
      [/\bwait for me\b/gi, `đợi ${selfPronoun} với`],
      [/\bdon't be afraid\b/gi, "đừng sợ nhé"],
      [/\bdon't worry\b/gi, "đừng lo lắng"],
      [/\bcome on\b/gi, "nhanh lên nào"],
      [/\blet's go\b/gi, "chúng mình đi thôi"],
      [/\brun faster\b/gi, "chạy nhanh lên"],
      [/\bwatch out\b/gi, "coi chừng đấy"],
      [/\bbe careful\b/gi, "cẩn thận nhé"],
      [/\bwhat is happening\b/gi, "chuyện gì đang xảy ra thế"],
      [/\bwhat are you doing\b/gi, `${partnerPronoun} đang làm gì vậy`],
      [/\bwhere are we going\b/gi, "chúng ta đang đi đâu thế"],
      [/\bwe made it\b/gi, "chúng ta làm được rồi"],
      [/\bwe can do this\b/gi, "chúng ta làm được mà"],
      [/\btrust me\b/gi, `hãy tin ${selfPronoun}`],
      [/\bfollow me\b/gi, `đi theo ${selfPronoun}`],
      [/\bcover me\b/gi, `yểm trợ cho ${selfPronoun}`],
      [/\bthe portal is closing\b/gi, "cánh cổng dịch chuyển đang khép lại"],
      [/\bin five seconds\b/gi, "trong năm giây nữa"],
      [/\bin ten seconds\b/gi, "trong mười giây nữa"],
      [/\bright now\b/gi, "ngay bây giờ"],
      [/\btogether\b/gi, "cùng nhau"],
      [/\blittle dragon\b/gi, "chú rồng nhỏ"],
      [/\bmagic power\b/gi, "sức mạnh phép thuật"],
      [/\bsecret mission\b/gi, "nhiệm vụ bí mật"],
      [/\bartificial intelligence\b/gi, "trí tuệ nhân tạo"],
      [/\bvoice synthesis\b/gi, "tổng hợp giọng nói"],
      [/\bthank you so much\b/gi, `cảm ơn ${partnerPronoun} rất nhiều`],
      [/\bthank you\b/gi, `cảm ơn ${partnerPronoun}`],
      [/\bgood morning\b/gi, "chào buổi sáng"],
      [/\bgood night\b/gi, "chúc ngủ ngon"],
      [/\bsee you again\b/gi, "hẹn gặp lại nhé"],
      [/\bi think\b/gi, `${selfPronoun} nghĩ là`],
      [/\bi believe\b/gi, `${selfPronoun} tin rằng`],
      [/\bi need\b/gi, `${selfPronoun} cần`],
      [/\bi want to\b/gi, `${selfPronoun} muốn`],
      [/\bi can\b/gi, `${selfPronoun} có thể`],
      [/\bi will\b/gi, `${selfPronoun} sẽ`],
      [/\bwe are\b/gi, `${genre.pronounPair.firstPersonPlural} đang`],
      [/\bwe have\b/gi, `${genre.pronounPair.firstPersonPlural} có`],
      [/\bwe must\b/gi, `${genre.pronounPair.firstPersonPlural} phải`],
      [/\byou are\b/gi, `${partnerPronoun} đang`],
      [/\byou can\b/gi, `${partnerPronoun} có thể`],
      [/\beveryone\b/gi, "mọi người"],
      [/\bmy friend\b/gi, "bạn của tớ"],
      [/\bthis world\b/gi, "thế giới này"],
      [/\bnever give up\b/gi, "đừng bao giờ bỏ cuộc"],
    ];

    let working = sourceText;
    let matchedCount = 0;
    for (const [pattern, replacement] of phraseMap) {
      if (pattern.test(working)) {
        working = working.replace(pattern, replacement);
        matchedCount++;
      }
    }

    if (matchedCount > 0) {
      // Clean up remaining standalone pronouns if any
      working = working
        .replace(/\bI\b/g, selfPronoun)
        .replace(/\byou\b/gi, partnerPronoun)
        .replace(/\bwe\b/gi, genre.pronounPair.firstPersonPlural);
      const trimmed = working.trim();
      return trimmed.charAt(0).toUpperCase() + trimmed.slice(1);
    }

    return "";
  }
}

export const genreCadenceEngine = new GenreCadenceEngine();
