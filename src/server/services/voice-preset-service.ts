import { prisma } from "@/server/db/prisma";
import {
  VoicePresetAssignmentItem,
  VoicePresetDomain,
} from "@/domain/models";
import { ValidationDomainError } from "@/domain/errors";
import { voiceCatalogService } from "@/server/services/voice-catalog-service";

export interface CreateVoicePresetInput {
  userId: string;
  name: string;
  jobId?: string;
  assignments?: VoicePresetAssignmentItem[];
}

export class VoicePresetService {
  public async createPreset(
    input: CreateVoicePresetInput
  ): Promise<VoicePresetDomain> {
    await voiceCatalogService.ensureDefaultVoicesSeeded();

    const name = (input.name || "").trim();
    if (!name) {
      throw new ValidationDomainError(
        "MISSING_PRESET_NAME",
        "Vui lòng đặt tên cho preset giọng nói trước khi lưu."
      );
    }

    let assignments: VoicePresetAssignmentItem[] = input.assignments ?? [];

    if (assignments.length === 0 && input.jobId) {
      const jobAssignments = await prisma.voiceAssignment.findMany({
        where: { jobId: input.jobId },
        include: { speaker: true },
        orderBy: { createdAt: "asc" },
      });

      assignments = jobAssignments.map((a) => ({
        speakerSignature: `${a.speaker.externalSpeakerId}:${
          a.speaker.roleHint ?? "character"
        }`,
        voiceId: a.voiceId,
      }));
    }

    if (assignments.length === 0) {
      throw new ValidationDomainError(
        "EMPTY_PRESET_ASSIGNMENTS",
        "Preset phải có ít nhất một gán giọng hợp lệ."
      );
    }

    for (const item of assignments) {
      if (!item.speakerSignature?.trim() || !item.voiceId?.trim()) {
        throw new ValidationDomainError(
          "INVALID_PRESET_ASSIGNMENT_ITEM",
          "Mỗi mục trong preset phải có speakerSignature và voiceId."
        );
      }
      const voice = await prisma.voice.findUnique({
        where: { id: item.voiceId },
      });
      if (!voice || !voice.isActive || voice.language !== "vi") {
        throw new ValidationDomainError(
          "INVALID_PRESET_VOICE",
          `Giọng đọc "${item.voiceId}" không hợp lệ hoặc không hỗ trợ tiếng Việt.`
        );
      }
    }

    const created = await prisma.voicePreset.create({
      data: {
        userId: input.userId,
        name,
        assignmentsJson: JSON.stringify(assignments),
      },
    });

    return {
      id: created.id,
      userId: created.userId,
      name: created.name,
      assignments: JSON.parse(created.assignmentsJson),
      createdAt: created.createdAt,
    };
  }

  public async listUserPresets(userId: string): Promise<VoicePresetDomain[]> {
    const rows = await prisma.voicePreset.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
    });

    return rows.map((r) => ({
      id: r.id,
      userId: r.userId,
      name: r.name,
      assignments: JSON.parse(r.assignmentsJson || "[]"),
      createdAt: r.createdAt,
    }));
  }
}

export const voicePresetService = new VoicePresetService();
