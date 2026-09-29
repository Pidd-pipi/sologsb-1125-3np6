import { create } from 'zustand';
import { db, makeId, seedIfEmpty } from '../db';
import type { AnalysisRecord } from '../types/analysis';
import type { FindRecord } from '../types/find';
import type { ChemicalGroup, ClassificationDecision, MeteoriteSample, SampleCategory } from '../types/sample';
import type { ThinSection } from '../types/section';
import { activeDecisionOf, decisionConflictsWith, snapshotEvaluation } from '../utils/classify';

export interface AddAnalysisResult {
  id: string;
  /** 该检测的建议分类是否与样本当前生效核定冲突，导致旧核定失效重核 */
  invalidatedDecision: boolean;
  supersededDecision?: ClassificationDecision;
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
  addAnalysis: (input: Omit<AnalysisRecord, 'id' | 'createdAt' | 'evaluation'>) => Promise<AddAnalysisResult>;
  confirmClassification: (
    sampleId: string,
    input: { category: SampleCategory; chemicalGroup: ChemicalGroup; reason: string },
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
    const record: MeteoriteSample = { ...input, id: makeId('sample'), createdAt: now, updatedAt: now };
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
    const evaluation = snapshotEvaluation(input);
    const record: AnalysisRecord = { ...input, id: makeId('analysis'), evaluation, createdAt: now };

    // 新检测的建议分类若与生效核定不一致，则旧核定自动失效，样本回到待复核；
    // 旧判断与其依据完整保留在 classificationDecisions 历史中。
    let updatedSample: MeteoriteSample | undefined;
    let supersededDecision: ClassificationDecision | undefined;
    await db.transaction('rw', db.analysis, db.samples, async () => {
      await db.analysis.add(record);
      const existing = get().samples.find((s) => s.id === input.sampleId);
      const active = existing ? activeDecisionOf(existing) : undefined;
      if (active && decisionConflictsWith(active, evaluation)) {
        const marked: ClassificationDecision = {
          ...active,
          status: 'superseded',
          supersededAt: now,
          supersedeReason: 'new-analysis',
          supersedeAnalysisId: record.id,
        };
        const decisions = [...(existing!.classificationDecisions ?? [])];
        const idx = decisions.findIndex((d) => d.id === active.id);
        if (idx >= 0) decisions[idx] = marked;
        updatedSample = { ...existing!, classificationDecisions: decisions, updatedAt: now };
        await db.samples.update(input.sampleId, { classificationDecisions: decisions, updatedAt: now });
        supersededDecision = marked;
      }
    });

    set((state) => ({
      analysis: [record, ...state.analysis],
      samples: updatedSample
        ? state.samples.map((s) => (s.id === updatedSample!.id ? updatedSample! : s))
        : state.samples,
    }));
    return { id: record.id, invalidatedDecision: !!supersededDecision, supersededDecision };
  },

  confirmClassification: async (sampleId, input) => {
    const now = Date.now();
    const existing = get().samples.find((s) => s.id === sampleId);
    if (!existing) return;
    const basedOnAnalysisIds = get()
      .analysis.filter((a) => a.sampleId === sampleId)
      .map((a) => a.id);
    const prev = activeDecisionOf(existing);
    const decision: ClassificationDecision = {
      id: makeId('decision'),
      decidedAt: now,
      category: input.category,
      chemicalGroup: input.chemicalGroup,
      reason: input.reason,
      basedOnAnalysisIds,
      status: 'active',
      ...(prev ? { prevDecisionId: prev.id } : {}),
    };
    const history = [...(existing.classificationDecisions ?? [])];
    if (prev) {
      const idx = history.findIndex((d) => d.id === prev.id);
      history[idx] = { ...prev, status: 'superseded' as const, supersededAt: now, supersedeReason: 'curator-revision' as const };
    }
    history.push(decision);

    const updated: MeteoriteSample = { ...existing, classificationDecisions: history, updatedAt: now };
    await db.samples.update(sampleId, { classificationDecisions: history, updatedAt: now });
    set({ samples: get().samples.map((s) => (s.id === sampleId ? updated : s)) });
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
