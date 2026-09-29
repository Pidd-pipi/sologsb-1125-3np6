import { create } from 'zustand';
import { db, makeId, seedIfEmpty } from '../db';
import type { AnalysisRecord } from '../types/analysis';
import type { FindRecord } from '../types/find';
import type {
  ClassificationDecision,
  ClassificationStatus,
  MeteoriteSample,
  SupersededDecision,
} from '../types/sample';
import type { ThinSection } from '../types/section';
import { classifyByAnalysis, evaluateThresholds } from '../utils/classify';
import { reconcileOnNewAnalysis } from '../utils/review';

export interface AddAnalysisOutcome {
  /** 新检测是否与既有检测意见产生分歧 */
  hasConflict: boolean;
  /** 新检测是否推翻了已确认裁决（样本重回待复核） */
  reopened: boolean;
}

export interface SampleState {
  samples: MeteoriteSample[];
  finds: FindRecord[];
  sections: ThinSection[];
  analysis: AnalysisRecord[];
  loading: boolean;
  loaded: boolean;
  loadAll: () => Promise<void>;
  addSample: (input: Omit<MeteoriteSample, 'id' | 'createdAt' | 'updatedAt'>) => Promise<string>;
  updateSample: (id: string, patch: Partial<MeteoriteSample>) => Promise<void>;
  removeSample: (id: string) => Promise<void>;
  addFind: (input: Omit<FindRecord, 'id' | 'createdAt'>) => Promise<string>;
  addSection: (input: Omit<ThinSection, 'id' | 'createdAt'>) => Promise<string>;
  updateSection: (id: string, patch: Partial<ThinSection>) => Promise<void>;
  addAnalysis: (input: Omit<AnalysisRecord, 'id' | 'createdAt' | 'evaluation'>) => Promise<AddAnalysisOutcome>;
  /** 策展人选定最终分类并填写理由；旧裁决归档到 decisionHistory 继续可查 */
  confirmClassification: (
    sampleId: string,
    decision: Omit<ClassificationDecision, 'decidedAt' | 'evidenceAnalysisIds'> &
      Partial<Pick<ClassificationDecision, 'evidenceAnalysisIds'>>,
  ) => Promise<void>;
  nextSampleSeq: () => number;
}

export const useSampleStore = create<SampleState>((set, get) => ({
  samples: [],
  finds: [],
  sections: [],
  analysis: [],
  loading: false,
  loaded: false,

  loadAll: async () => {
    set({ loading: true });
    await seedIfEmpty();
    const [samples, finds, sections, analysis] = await Promise.all([
      db.samples.toArray(),
      db.finds.toArray(),
      db.sections.toArray(),
      db.analysis.toArray(),
    ]);
    samples.sort((a, b) => b.createdAt - a.createdAt);
    finds.sort((a, b) => b.createdAt - a.createdAt);
    sections.sort((a, b) => b.createdAt - a.createdAt);
    analysis.sort((a, b) => b.createdAt - a.createdAt);
    set({ samples, finds, sections, analysis, loading: false, loaded: true });
  },

  addSample: async (input) => {
    const now = Date.now();
    // 新登记样本：登记分类仅为初判，未经策展人复核前一律待复核
    const record: MeteoriteSample = {
      ...input,
      classificationStatus: (input.classificationStatus ?? 'pending-review') as ClassificationStatus,
      classificationDecision: input.classificationDecision ?? null,
      decisionHistory: input.decisionHistory ?? [],
      id: makeId('sample'),
      createdAt: now,
      updatedAt: now,
    };
    await db.samples.add(record);
    set({ samples: [record, ...get().samples] });
    return record.id;
  },

  updateSample: async (id, patch) => {
    const updatedAt = Date.now();
    await db.samples.update(id, { ...patch, updatedAt });
    set({
      samples: get().samples.map((s) => (s.id === id ? { ...s, ...patch, updatedAt } : s)),
    });
  },

  removeSample: async (id) => {
    await db.transaction('rw', db.samples, db.finds, db.sections, db.analysis, async () => {
      await db.samples.delete(id);
      await db.finds.where('sampleId').equals(id).delete();
      await db.sections.where('sampleId').equals(id).delete();
      await db.analysis.where('sampleId').equals(id).delete();
    });
    set({
      samples: get().samples.filter((s) => s.id !== id),
      finds: get().finds.filter((f) => f.sampleId !== id),
      sections: get().sections.filter((s) => s.sampleId !== id),
      analysis: get().analysis.filter((a) => a.sampleId !== id),
    });
  },

  addFind: async (input) => {
    const record: FindRecord = { ...input, id: makeId('find'), createdAt: Date.now() };
    await db.finds.add(record);
    set({ finds: [record, ...get().finds] });
    return record.id;
  },

  addSection: async (input) => {
    const record: ThinSection = { ...input, id: makeId('section'), createdAt: Date.now() };
    await db.sections.add(record);
    set({ sections: [record, ...get().sections] });
    return record.id;
  },

  updateSection: async (id, patch) => {
    await db.sections.update(id, patch);
    set({ sections: get().sections.map((s) => (s.id === id ? { ...s, ...patch } : s)) });
  },

  addAnalysis: async (input) => {
    const now = Date.now();
    // 保存时固化本条记录自己的分类建议与阈值命中，之后不再随后续规则变化
    const record: AnalysisRecord = {
      ...input,
      id: makeId('analysis'),
      createdAt: now,
      evaluation: {
        advice: classifyByAnalysis(input),
        hits: evaluateThresholds(input),
      },
    };

    const sample = get().samples.find((s) => s.id === record.sampleId);
    const reopenPatch = sample ? reconcileOnNewAnalysis(sample, record, now) : null;

    await db.transaction('rw', db.analysis, db.samples, async () => {
      await db.analysis.add(record);
      if (reopenPatch) await db.samples.update(record.sampleId, { ...reopenPatch, updatedAt: now });
    });

    // 意见分歧：与同样本其它现存检测的建议分类不一致
    const priorAdvice = new Set(
      get()
        .analysis.filter((a) => a.sampleId === record.sampleId)
        .map((a) =>
          a.evaluation ? a.evaluation.advice.category : classifyByAnalysis(a).category,
        ),
    );
    const hasConflict = [...priorAdvice].some((c) => c !== record.evaluation!.advice.category);

    set((state) => ({
      analysis: [record, ...state.analysis],
      samples: reopenPatch
        ? state.samples.map((s) =>
            s.id === record.sampleId ? { ...s, ...reopenPatch, updatedAt: now } : s,
          )
        : state.samples,
    }));

    return { hasConflict, reopened: reopenPatch !== null };
  },

  confirmClassification: async (sampleId, decisionInput) => {
    const now = Date.now();
    const sample = get().samples.find((s) => s.id === sampleId);
    if (!sample) return;

    const decision: ClassificationDecision = {
      category: decisionInput.category,
      chemicalGroup: decisionInput.chemicalGroup,
      reason: decisionInput.reason,
      curator: decisionInput.curator?.trim() || undefined,
      decidedAt: now,
      evidenceAnalysisIds:
        decisionInput.evidenceAnalysisIds ??
        get()
          .analysis.filter((a) => a.sampleId === sampleId)
          .map((a) => a.id),
    };

    // 策展人重新裁决（待复核本可能由旧裁决被推翻引起）：把旧裁决归档留痕
    let history: SupersededDecision[] = sample.decisionHistory ?? [];
    if (sample.classificationStatus === 'confirmed' && sample.classificationDecision) {
      history = [
        {
          ...sample.classificationDecision,
          supersededReason: 're-decided',
          supersededAt: now,
        },
        ...history,
      ];
    }

    const patch: Partial<MeteoriteSample> = {
      classificationStatus: 'confirmed',
      classificationDecision: decision,
      decisionHistory: history,
      updatedAt: now,
    };
    await db.samples.update(sampleId, patch);
    set({
      samples: get().samples.map((s) => (s.id === sampleId ? { ...s, ...patch } : s)),
    });
  },

  nextSampleSeq: () => {
    const year = new Date().getFullYear();
    const prefix = `MET-${year}-`;
    const used = get()
      .samples.map((s) => s.sampleNo)
      .filter((no) => no.startsWith(prefix))
      .map((no) => Number(no.slice(prefix.length)))
      .filter((n) => Number.isFinite(n));
    const max = used.length ? Math.max(...used) : 0;
    return max + 1;
  },
}));
