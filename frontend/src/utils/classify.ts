import { ANALYSIS_THRESHOLDS, type AnalysisRecord, type StoredAnalysisEvaluation, type ThresholdHit } from '../types/analysis';
import type {
  ClassificationAdvice,
  ClassificationDecision,
  ClassificationReviewStatus,
  MeteoriteSample,
  SampleCategory,
} from '../types/sample';

/** 依据 Fa / Fs / Ni 与铁纹石带宽给出分类建议与置信说明 */
export function classifyByAnalysis(
  input: Pick<AnalysisRecord, 'fa' | 'fs' | 'ni' | 'kamaciteBandwidth'>,
): ClassificationAdvice {
  const { fa, fs, ni, kamaciteBandwidth } = input;
  const hits: string[] = [];
  let category: SampleCategory = 'chondrite';
  let confidence: ClassificationAdvice['confidence'] = 'low';

  const highNi = Number(ni) >= 5;
  const lowNi = Number(ni) < 1;
  const wideBand = Number(kamaciteBandwidth) >= 0.5;
  const narrowBand = Number(kamaciteBandwidth) > 0 && Number(kamaciteBandwidth) < 0.2;
  const moderateFa = Number(fa) >= 15 && Number(fa) <= 30;
  const lowFa = Number(fa) < 12;
  const fsFaGap = Math.abs(Number(fs) - Number(fa));

  if (highNi && wideBand) {
    category = 'iron';
    confidence = 'high';
    hits.push(`Ni ${ni} wt% ≥ 5 wt%，落入铁陨石常见区间`);
    hits.push(`铁纹石带宽 ${kamaciteBandwidth} mm ≥ 0.5 mm，指示粗粒八面体结构`);
  } else if (highNi && narrowBand) {
    category = 'iron';
    confidence = 'medium';
    hits.push(`Ni ${ni} wt% 偏高，但铁纹石带宽 ${kamaciteBandwidth} mm < 0.2 mm，偏六面体铁陨石`);
  } else if (highNi && !wideBand && !narrowBand) {
    category = 'stony-iron';
    confidence = 'medium';
    hits.push(`Ni ${ni} wt% 高且金属占比可观，倾向石铁陨石过渡类型`);
  } else if (moderateFa && !highNi) {
    category = 'chondrite';
    confidence = 'high';
    hits.push(`橄榄石 Fa ${fa} mol% 落在 15–30 mol% 的普通球粒区间`);
    if (lowNi) hits.push(`Ni ${ni} wt% < 1 wt%，符合石陨石特征`);
  } else if (lowFa && !highNi) {
    category = 'achondrite';
    confidence = fsFaGap > 8 ? 'medium' : 'low';
    hits.push(`橄榄石 Fa ${fa} mol% 偏低，普通球粒特征不足`);
    if (fsFaGap > 8) hits.push(`辉石 Fs 与 Fa 差值 ${fsFaGap.toFixed(1)} mol%，指示非平衡或混合样品`);
  } else {
    category = 'chondrite';
    confidence = 'low';
    hits.push('数值处在判别边界，建议补测 Ni 与金属相后再判定');
  }

  const summary =
    confidence === 'high'
      ? `建议归类为${labelOf(category)}，判据充分。`
      : confidence === 'medium'
        ? `倾向${labelOf(category)}，仍有一项判据不典型，建议复核。`
        : `暂按${labelOf(category)}记录，判据不足，需补测。`;

  return { category, confidence, summary, hits };
}

function labelOf(category: SampleCategory): string {
  switch (category) {
    case 'chondrite':
      return '球粒陨石';
    case 'iron':
      return '铁陨石';
    case 'stony-iron':
      return '石铁陨石';
    case 'achondrite':
      return '无球粒陨石';
    default:
      return '未定';
  }
}

/** 逐项计算阈值命中情况，供页面展示命中说明 */
export function evaluateThresholds(
  input: Pick<AnalysisRecord, 'fa' | 'fs' | 'ni' | 'kamaciteBandwidth'>,
): ThresholdHit[] {
  return ANALYSIS_THRESHOLDS.map((t) => {
    const value = Number(input[t.key]) || 0;
    return {
      key: t.key,
      label: t.label,
      value,
      unit: t.unit,
      inRange: value >= t.min && value <= t.max,
      description: t.description,
    };
  });
}

/** 对一条检测同时给出分类建议与逐项阈值命中 */
export function evaluateAnalysis(
  input: Pick<AnalysisRecord, 'fa' | 'fs' | 'ni' | 'kamaciteBandwidth'>,
): { advice: ClassificationAdvice; thresholdHits: ThresholdHit[] } {
  return { advice: classifyByAnalysis(input), thresholdHits: evaluateThresholds(input) };
}

/** 生成录入时固化到检测记录上的评估快照 */
export function snapshotEvaluation(
  input: Pick<AnalysisRecord, 'fa' | 'fs' | 'ni' | 'kamaciteBandwidth'>,
): StoredAnalysisEvaluation {
  return evaluateAnalysis(input);
}

/**
 * 读取一条检测的评估：优先用录入时固化的快照，
 * v4 之前的旧记录没有快照则按当前规则即时回算。
 */
export function getAnalysisEvaluation(record: AnalysisRecord): StoredAnalysisEvaluation {
  if (record.evaluation) return record.evaluation;
  return evaluateAnalysis(record);
}

/** 取样本当前生效的策展核定（无则返回 undefined） */
export function activeDecisionOf(sample: MeteoriteSample): ClassificationDecision | undefined {
  const list = sample.classificationDecisions ?? [];
  return list.find((d) => d.status === 'active');
}

/** 分类建议统计：各建议分类的检测条数（按登记先后稳定排序） */
export interface AdviceTally {
  category: SampleCategory;
  count: number;
}

/** 汇总同一样本下各检测记录的建议分类 */
export function tallyAdvice(records: AnalysisRecord[]): AdviceTally[] {
  const order: SampleCategory[] = [];
  const counts = new Map<SampleCategory, number>();
  const sorted = [...records].sort((a, b) => a.createdAt - b.createdAt);
  for (const rec of sorted) {
    const cat = getAnalysisEvaluation(rec).advice.category;
    if (!counts.has(cat)) order.push(cat);
    counts.set(cat, (counts.get(cat) ?? 0) + 1);
  }
  return order.map((category) => ({ category, count: counts.get(category) ?? 0 }));
}

/** 检测建议是否出现分歧（出现两个及以上不同建议分类） */
export function hasDisagreement(records: AnalysisRecord[]): boolean {
  return tallyAdvice(records).length >= 2;
}

/** 样本分类复核结论：状态、当前对外采用的分类/化学群、是否存在建议分歧 */
export interface SampleClassification {
  status: ClassificationReviewStatus;
  /** 复核状态细分：pending 且建议一致为「待确认」，存在分歧为「待复核」 */
  disagreement: boolean;
  /** 对外采用的分类：confirmed 取核定值；无检测时取登记初判；待复核期间为 null */
  effectiveCategory: SampleCategory | null;
  effectiveGroup: MeteoriteSample['chemicalGroup'] | null;
  advice: AdviceTally[];
  activeDecision?: ClassificationDecision;
}

/**
 * 汇总样本与其全部检测记录，得出当前应展示/参与筛选的分类。
 *  - 无检测：沿用登记初判
 *  - 有检测无生效核定：样本进入待复核（建议一致时提示待确认），不采用任何结果
 *  - 有生效核定：采用策展结果
 */
export function classificationOf(
  sample: MeteoriteSample,
  records: AnalysisRecord[],
): SampleClassification {
  const advice = tallyAdvice(records);
  const disagreement = advice.length >= 2;
  const active = activeDecisionOf(sample);

  if (records.length === 0) {
    return {
      status: 'unanalyzed',
      disagreement: false,
      effectiveCategory: sample.category,
      effectiveGroup: sample.chemicalGroup,
      advice: [],
    };
  }

  if (!active) {
    return {
      status: 'pending',
      disagreement,
      effectiveCategory: null,
      effectiveGroup: null,
      advice,
    };
  }

  return {
    status: 'confirmed',
    disagreement,
    effectiveCategory: active.category,
    effectiveGroup: active.chemicalGroup,
    advice,
    activeDecision: active,
  };
}

/**
 * 判断新增一条检测后，样本当前生效的核定是否不再成立：
 * 新检测的建议分类与核定分类不一致即视为出现分歧，需重新复核。
 */
export function decisionConflictsWith(
  decision: ClassificationDecision | undefined,
  evaluation: StoredAnalysisEvaluation,
): boolean {
  return !!decision && decision.category !== evaluation.advice.category;
}
