import type { AnalysisRecord, AnalysisEvaluation } from '../types/analysis';
import {
  CATEGORY_LABELS,
  type ClassificationStatus,
  type MeteoriteSample,
  type SampleCategory,
} from '../types/sample';
import { classifyByAnalysis, evaluateThresholds } from './classify';

/** 取检测记录的评估快照：优先使用保存时固化的结果，v3 旧记录缺省时按当前规则补算 */
export function getAnalysisEvaluation(record: AnalysisRecord): AnalysisEvaluation {
  if (record.evaluation) return record.evaluation;
  return {
    advice: classifyByAnalysis(record),
    hits: evaluateThresholds(record),
  };
}

export interface EvaluationEntry {
  record: AnalysisRecord;
  evaluation: AnalysisEvaluation;
}

/** 样本下各条检测的意见汇总（每条保留自己的阈值命中） */
export interface ReviewSummary {
  status: ClassificationStatus;
  entries: EvaluationEntry[];
  /** 去重后出现过的建议分类 */
  adviceCategories: SampleCategory[];
  /** 检测意见是否存在分歧 */
  hasConflict: boolean;
  /** 意见一致时的共同分类，否则为 null */
  consensusCategory: SampleCategory | null;
  /** 待复核原因（供详情页展示） */
  pendingReason: string | null;
  /** 已确认结果是否已被新检测推翻（持久化状态可能晚于检测变化，这里实时判断） */
  reopenedByAnalysis: boolean;
}

/**
 * 计算样本当前的复核状态与意见汇总。
 * 纯函数：不修改数据，状态的持久化由 sampleStore 完成。
 */
export function summarizeReview(sample: MeteoriteSample, analysis: AnalysisRecord[]): ReviewSummary {
  const entries = analysis
    .filter((a) => a.sampleId === sample.id)
    .sort((a, b) => (a.testedAt < b.testedAt ? 1 : a.testedAt > b.testedAt ? -1 : b.createdAt - a.createdAt))
    .map((record) => ({ record, evaluation: getAnalysisEvaluation(record) }));

  const adviceCategories: SampleCategory[] = [];
  for (const e of entries) {
    if (!adviceCategories.includes(e.evaluation.advice.category)) {
      adviceCategories.push(e.evaluation.advice.category);
    }
  }
  const hasConflict = adviceCategories.length > 1;
  const consensusCategory = adviceCategories.length === 1 ? adviceCategories[0] : null;

  const decision = sample.classificationDecision ?? null;
  // 已确认裁决若与现存任何一条检测意见不一致，即视为被新检测推翻
  const reopenedByAnalysis =
    sample.classificationStatus === 'confirmed' &&
    decision !== null &&
    adviceCategories.some((c) => c !== decision.category);

  const status: ClassificationStatus =
    sample.classificationStatus === 'confirmed' && decision && !reopenedByAnalysis
      ? 'confirmed'
      : 'pending-review';

  let pendingReason: string | null = null;
  if (status === 'pending-review') {
    if (entries.length === 0) {
      pendingReason = '尚无检测记录，登记分类缺少检测依据，等待录入检测后由策展人复核。';
    } else if (reopenedByAnalysis && decision) {
      pendingReason = `新增检测意见与已确认分类「${CATEGORY_LABELS[decision.category]}」不一致，原裁决已转入历史记录，需重新复核。`;
    } else if (hasConflict) {
      pendingReason = `各条检测建议不一致（${adviceCategories
        .map((c) => CATEGORY_LABELS[c])
        .join(' / ')}），需策展人核对依据后选定最终分类。`;
    } else {
      pendingReason = '检测意见一致，等待策展人采信并填写理由。';
    }
  }

  return {
    status,
    entries,
    adviceCategories,
    hasConflict,
    consensusCategory,
    pendingReason,
    reopenedByAnalysis,
  };
}

/**
 * 新增一条检测后，判断已确认结果是否仍成立；不成立时返回待复核的补丁
 * （旧裁决归档到 decisionHistory，判定与选择依据继续可查）。
 */
export function reconcileOnNewAnalysis(
  sample: MeteoriteSample,
  newRecord: AnalysisRecord,
  now: number,
): Partial<MeteoriteSample> | null {
  if (sample.classificationStatus !== 'confirmed' || !sample.classificationDecision) return null;
  const advice = getAnalysisEvaluation(newRecord).advice;
  if (advice.category === sample.classificationDecision.category) return null;

  const superseded = {
    ...sample.classificationDecision,
    supersededReason: 'new-conflict' as const,
    supersededAt: now,
    triggeredByAnalysisId: newRecord.id,
  };
  return {
    classificationStatus: 'pending-review',
    classificationDecision: null,
    decisionHistory: [superseded, ...(sample.decisionHistory ?? [])],
  };
}

/** 生效分类：仅策展人已确认时对外（详情/总览/筛选）采信 */
export function effectiveCategory(sample: MeteoriteSample): SampleCategory | null {
  if (sample.classificationStatus === 'confirmed' && sample.classificationDecision) {
    return sample.classificationDecision.category;
  }
  return null;
}

/** 生效化学群：仅策展人已确认时对外采信 */
export function effectiveChemicalGroup(sample: MeteoriteSample): MeteoriteSample['chemicalGroup'] | null {
  if (sample.classificationStatus === 'confirmed' && sample.classificationDecision) {
    return sample.classificationDecision.chemicalGroup;
  }
  return null;
}
