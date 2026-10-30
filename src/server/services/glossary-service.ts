import { prisma } from "@/server/db/prisma";
import { GlossaryCategory, GlossaryEntryDomain } from "@/domain/models";
import { ValidationDomainError } from "@/domain/errors";

export interface GlossaryRuleInput {
  category?: GlossaryCategory;
  sourceTerm: string;
  targetTerm: string;
  speakerId?: string | null;
  notes?: string | null;
}

export class GlossaryService {
  public async replaceJobGlossary(params: {
    jobId: string;
    userId: string;
    entries: GlossaryRuleInput[];
  }): Promise<GlossaryEntryDomain[]> {
    const cleanedEntries = params.entries.map((entry) => {
      const sourceTerm = (entry.sourceTerm || "").trim();
      const targetTerm = (entry.targetTerm || "").trim();
      if (!sourceTerm || !targetTerm) {
        throw new ValidationDomainError(
          "INVALID_GLOSSARY_ENTRY",
          "Từ gốc và từ đích trong Glossary không được để trống."
        );
      }
      const category: GlossaryCategory =
        entry.category === "proper_noun" ||
        entry.category === "term" ||
        entry.category === "pronoun_rule"
          ? entry.category
          : "term";

      return {
        jobId: params.jobId,
        userId: params.userId,
        category,
        sourceTerm,
        targetTerm,
        speakerId: entry.speakerId ?? null,
        notes: entry.notes ?? null,
      };
    });

    await prisma.$transaction(async (tx) => {
      await tx.glossaryEntry.deleteMany({ where: { jobId: params.jobId } });
      if (cleanedEntries.length > 0) {
        await tx.glossaryEntry.createMany({ data: cleanedEntries });
      }
    });

    return this.getJobGlossary(params.jobId);
  }

  public async getJobGlossary(jobId: string): Promise<GlossaryEntryDomain[]> {
    const rows = await prisma.glossaryEntry.findMany({
      where: { jobId },
      orderBy: { createdAt: "asc" },
    });
    return rows.map((r) => ({
      id: r.id,
      jobId: r.jobId,
      userId: r.userId,
      category: r.category as GlossaryCategory,
      sourceTerm: r.sourceTerm,
      targetTerm: r.targetTerm,
      speakerId: r.speakerId,
      notes: r.notes,
      createdAt: r.createdAt,
    }));
  }

  public applyGlossaryToText(params: {
    text: string;
    speakerId: string;
    glossaryEntries: GlossaryEntryDomain[];
  }): string {
    let result = params.text;

    for (const rule of params.glossaryEntries) {
      if (rule.speakerId && rule.speakerId !== params.speakerId) {
        continue;
      }

      if (rule.category === "pronoun_rule") {
        // Apply speaker pronoun rule (e.g. sourceTerm="tôi" -> targetTerm="mình")
        const escaped = rule.sourceTerm.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        const regex = new RegExp(`\\b${escaped}\\b`, "gi");
        result = result.replace(regex, rule.targetTerm);
      } else {
        const escaped = rule.sourceTerm.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        const regex = new RegExp(escaped, "gi");
        result = result.replace(regex, rule.targetTerm);
      }
    }

    return result;
  }
}

export const glossaryService = new GlossaryService();
