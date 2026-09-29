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
 * 分类复核状态：
 *  - unanalyzed：尚无检测记录，沿用登记时的初判分类
 *  - pending：已有检测但无生效的策展核定（建议一致为「待确认」，分歧为「待复核」）
 *  - confirmed：策展人已选定最终分类并填写理由，详情 / 总览 / 筛选均采用该结果
 */
export type ClassificationReviewStatus = 'unanalyzed' | 'pending' | 'confirmed';

/** 策展人对样本分类的一次核定（新检测导致失效时保留为历史记录） */
export interface ClassificationDecision {
  id: string;
  decidedAt: number;
  category: SampleCategory;
  chemicalGroup: ChemicalGroup;
  /** 策展人填写的核定理由（必填） */
  reason: string;
  /** 核定时所依据的全部检测记录 id；其后新增且结论分歧的检测会使本判断失效 */
  basedOnAnalysisIds: string[];
  status: 'active' | 'superseded';
  /** 改判链条中指向上一条判断 */
  prevDecisionId?: string;
  supersededAt?: number;
  /** 失效方式：新增检测使结论不再成立 / 策展人重新核定 */
  supersedeReason?: 'new-analysis' | 'curator-revision';
  /** 导致本判断失效的检测记录 id（supersedeReason 为 new-analysis 时） */
  supersedeAnalysisId?: string;
}

/** 陨石样本（MeteoriteSample） */
export interface MeteoriteSample {
  id: string;
  /** 样本编号，形如 MET-2024-001 */
  sampleNo: string;
  /** 总重量，单位 g */
  totalWeight: number;
  /** 登记时填写的分类（初判）；检测汇总与策展核定见 classificationDecisions */
  category: SampleCategory;
  /** 登记时填写的化学群（初判） */
  chemicalGroup: ChemicalGroup;
  weathering: WeatheringGrade;
  fallOrFind: FallOrFind;
  storage: StorageLocation;
  /** 备注（可选） */
  note?: string;
  /** 历次分类核定，末位为当前生效判断；空数组/缺省表示尚未核定 */
  classificationDecisions?: ClassificationDecision[];
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
