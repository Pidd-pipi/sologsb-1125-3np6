/** 陨石分类：球粒陨石 / 铁陨石 / 石铁陨石 / 无球粒陨石 */
export type SampleCategory = 'chondrite' | 'iron' | 'stony-iron' | 'achondrite';

/** 化学群：普通球粒 H/L/LL 与铁陨石 IAB；未知时用 ungrouped */
export type ChemicalGroup = 'H' | 'L' | 'LL' | 'IAB' | 'ungrouped';

/** 风化等级 W0（新鲜）→ W4（严重风化） */
export type WeatheringGrade = 'W0' | 'W1' | 'W2' | 'W3' | 'W4';

/** 发现或坠落标记 */
export type FallOrFind = 'fall' | 'find';

/** 存放位置 */
export type StorageLocation = 'cabinet-a' | 'cabinet-b' | 'desiccator' | 'loan-out';

/**
 * 分类复核状态（v4 起）：
 *  - pending-review：检测意见尚未经策展人采信。检测意见分歧、尚无检测或已确认结果被新检测推翻时处于该状态；
 *  - confirmed：策展人已基于各条检测依据选定最终分类并填写理由，详情/总览/筛选采用该结果。
 */
export type ClassificationStatus = 'pending-review' | 'confirmed';

/**
 * 策展人最终裁决：仅在 confirmed 时生效。
 * 登记时填写的 category / chemicalGroup 保留为「初判」，不再被对外页面直接采信。
 */
export interface ClassificationDecision {
  /** 策展人最终选定的分类 */
  category: SampleCategory;
  /** 策展人最终选定的化学群 */
  chemicalGroup: ChemicalGroup;
  /** 必填：采信理由 */
  reason: string;
  /** 策展人署名（可选） */
  curator?: string;
  /** 裁决时间 */
  decidedAt: number;
  /** 裁决时引用的检测记录 id（各条依据） */
  evidenceAnalysisIds: string[];
}

/** 被推翻 / 被替换的历史裁决，永久保留可查 */
export interface SupersededDecision extends ClassificationDecision {
  /** 失效原因：new-conflict（新检测与裁决不一致）/ re-decided（策展人重新裁决） */
  supersededReason: 'new-conflict' | 're-decided';
  /** 失效时间 */
  supersededAt: number;
  /** 触发推翻的检测记录 id（new-conflict 时） */
  triggeredByAnalysisId?: string;
}

/** 陨石样本（MeteoriteSample） */
export interface MeteoriteSample {
  id: string;
  /** 样本编号，形如 MET-2024-001 */
  sampleNo: string;
  /** 总重量，单位 g */
  totalWeight: number;
  /** 登记时的初步分类：未经裁决前不被对外页面直接采信 */
  category: SampleCategory;
  /** 登记时的初步化学群 */
  chemicalGroup: ChemicalGroup;
  weathering: WeatheringGrade;
  fallOrFind: FallOrFind;
  storage: StorageLocation;
  /** 备注（可选） */
  note?: string;
  /** v4 起：分类复核状态；旧数据迁移时回填为 pending-review */
  classificationStatus?: ClassificationStatus;
  /** v4 起：策展人最终裁决（confirmed 时存在） */
  classificationDecision?: ClassificationDecision | null;
  /** v4 起：被推翻/替换的历史裁决，按失效时间倒序维护 */
  decisionHistory?: SupersededDecision[];
  createdAt: number;
  /** v3 升级迁移新增字段 */
  updatedAt: number;
}

export const CATEGORY_LABELS: Record<SampleCategory, string> = {
  chondrite: '球粒陨石',
  iron: '铁陨石',
  'stony-iron': '石铁陨石',
  achondrite: '无球粒陨石',
};

export const CHEMICAL_GROUP_LABELS: Record<ChemicalGroup, string> = {
  H: 'H（高铁）',
  L: 'L（低铁）',
  LL: 'LL（低铁低金属）',
  IAB: 'IAB（铁陨石群）',
  ungrouped: '未分群',
};

export const WEATHERING_LABELS: Record<WeatheringGrade, string> = {
  W0: 'W0 新鲜',
  W1: 'W1 轻微',
  W2: 'W2 中等',
  W3: 'W3 明显',
  W4: 'W4 严重',
};

export const FALL_OR_FIND_LABELS: Record<FallOrFind, string> = {
  fall: '目击坠落',
  find: '发现',
};

export const STORAGE_LABELS: Record<StorageLocation, string> = {
  'cabinet-a': 'A 柜 · 干燥剂箱',
  'cabinet-b': 'B 柜 · 常温架',
  desiccator: '真空干燥器',
  'loan-out': '外借中',
};

export const SAMPLE_CATEGORIES: SampleCategory[] = ['chondrite', 'iron', 'stony-iron', 'achondrite'];
export const CHEMICAL_GROUPS: ChemicalGroup[] = ['H', 'L', 'LL', 'IAB', 'ungrouped'];
export const WEATHERING_GRADES: WeatheringGrade[] = ['W0', 'W1', 'W2', 'W3', 'W4'];
export const FALL_OR_FINDS: FallOrFind[] = ['fall', 'find'];
export const STORAGE_LOCATIONS: StorageLocation[] = ['cabinet-a', 'cabinet-b', 'desiccator', 'loan-out'];

export const CLASSIFICATION_STATUS_LABELS: Record<ClassificationStatus, string> = {
  'pending-review': '待复核',
  confirmed: '已确认',
};

/** 各分类下策展人裁决时化学群的默认/候选项 */
export const CATEGORY_DEFAULT_GROUP: Record<SampleCategory, ChemicalGroup> = {
  chondrite: 'H',
  iron: 'IAB',
  'stony-iron': 'ungrouped',
  achondrite: 'ungrouped',
};

/** 分类建议结果 */
export interface ClassificationAdvice {
  category: SampleCategory;
  confidence: 'high' | 'medium' | 'low';
  summary: string;
  hits: string[];
}

/** 样本编号生成：MET-<年>-<三位序号> */
export function generateSampleNo(year: number, seq: number): string {
  return `MET-${year}-${String(seq).padStart(3, '0')}`;
}
