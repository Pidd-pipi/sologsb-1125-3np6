import Dexie, { type Table } from 'dexie';
import type { MeteoriteSample } from '../types/sample';
import type { FindRecord } from '../types/find';
import type { ThinSection } from '../types/section';
import type { AnalysisRecord } from '../types/analysis';
import { classifyByAnalysis, evaluateThresholds } from '../utils/classify';

/** 库名固定为 gbmeteorite-db */
export const DB_NAME = 'gbmeteorite-db';

/**
 * 版本历史（IndexedDB 升级迁移）：
 *  - v1：建 samples / finds / sections 三张表
 *  - v2：新增 analysis 表，并为 analysis 加 sampleId 索引
 *  - v3：为 samples 补 updatedAt 字段，并按 id 回填旧记录
 *  - v4：样本引入分类复核状态机（待复核 / 已确认 + 裁决留痕），
 *        检测记录可固化评估快照。旧库样本一律转为待复核（登记分类保留为初判），
 *        旧检测按当前规则补算快照，旧判断由策展人重新采信。
 */
export class MeteoriteDB extends Dexie {
  samples!: Table<MeteoriteSample, string>;
  finds!: Table<FindRecord, string>;
  sections!: Table<ThinSection, string>;
  analysis!: Table<AnalysisRecord, string>;

  constructor() {
    super(DB_NAME);

    this.version(1).stores({
      samples: 'id, sampleNo, category, chemicalGroup, totalWeight, createdAt',
      finds: 'id, sampleId, region, createdAt',
      sections: 'id, sectionNo, sampleId, thickness, createdAt',
    });

    this.version(2)
      .stores({
        samples: 'id, sampleNo, category, chemicalGroup, totalWeight, createdAt',
        finds: 'id, sampleId, region, createdAt',
        sections: 'id, sectionNo, sampleId, thickness, createdAt',
        analysis: 'id, sampleId, sectionId, method, testedAt, createdAt',
      })
      .upgrade(async (tx) => {
        // v2：旧记录补齐新表所需字段，避免读取时 undefined
        await tx
          .table<AnalysisRecord, string>('analysis')
          .toCollection()
          .modify((rec) => {
            if (typeof rec.createdAt !== 'number') rec.createdAt = Date.now();
          });
      });

    this.version(3)
      .stores({
        samples:
          'id, sampleNo, category, chemicalGroup, totalWeight, createdAt, updatedAt',
        finds: 'id, sampleId, region, createdAt',
        sections: 'id, sectionNo, sampleId, thickness, createdAt',
        analysis: 'id, sampleId, sectionId, method, testedAt, createdAt',
      })
      .upgrade(async (tx) => {
        // v3：为样本表补 updatedAt，并按 id 回填旧记录
        await tx
          .table<MeteoriteSample, string>('samples')
          .toCollection()
          .modify((sample) => {
            if (typeof sample.updatedAt !== 'number') {
              sample.updatedAt =
                typeof sample.createdAt === 'number' ? sample.createdAt : Date.now();
            }
          });
      });

    this.version(4)
      .stores({
        samples:
          'id, sampleNo, category, chemicalGroup, totalWeight, createdAt, updatedAt',
        finds: 'id, sampleId, region, createdAt',
        sections: 'id, sectionNo, sampleId, thickness, createdAt',
        analysis: 'id, sampleId, sectionId, method, testedAt, createdAt',
      })
      .upgrade(async (tx) => {
        // v4：旧库样本一律进入待复核；登记时的分类保留为初判，等策展人重新采信
        await tx
          .table<MeteoriteSample, string>('samples')
          .toCollection()
          .modify((sample) => {
            if (sample.classificationStatus !== 'confirmed') {
              sample.classificationStatus = 'pending-review';
              sample.classificationDecision = null;
              if (!Array.isArray(sample.decisionHistory)) sample.decisionHistory = [];
            }
          });
        // v4：旧检测缺评估快照时按当前规则补算，每条记录保留自己的阈值命中
        await tx
          .table<AnalysisRecord, string>('analysis')
          .toCollection()
          .modify((rec) => {
            if (!rec.evaluation) {
              rec.evaluation = {
                advice: classifyByAnalysis(rec),
                hits: evaluateThresholds(rec),
              };
            }
          });
      });
  }
}

export const db = new MeteoriteDB();

/** 生成一个稳定的本地 id */
export function makeId(prefix: string): string {
  const rand = Math.random().toString(36).slice(2, 8);
  return `${prefix}_${Date.now().toString(36)}_${rand}`;
}

/** 首次运行时灌入演示档案，保证页面有可检索内容 */
export async function seedIfEmpty(): Promise<void> {
  const count = await db.samples.count();
  if (count > 0) return;
  const now = Date.now();
  const day = 86400000;
  /** 种子检测记录顺手固化评估快照，保证「每条记录保留自己的阈值命中」 */
  const stamp = (rec: Omit<AnalysisRecord, 'evaluation'>): AnalysisRecord => ({
    ...rec,
    evaluation: {
      advice: classifyByAnalysis(rec),
      hits: evaluateThresholds(rec),
    },
  });
  await db.transaction('rw', db.samples, db.finds, db.sections, db.analysis, async () => {
    await db.samples.bulkAdd([
      {
        id: 'sample_seed_1',
        sampleNo: 'MET-2024-001',
        totalWeight: 1250.4,
        category: 'chondrite',
        chemicalGroup: 'H',
        weathering: 'W1',
        fallOrFind: 'find',
        storage: 'cabinet-a',
        note: '撒哈拉回收，熔壳完整',
        classificationStatus: 'confirmed',
        classificationDecision: {
          category: 'chondrite',
          chemicalGroup: 'H',
          reason: '电子探针 Fa 18.6 / Fs 16.2 落在普通球粒 H 群区间，Ni 0.8 wt% 符合石陨石特征，检测意见一致，采信。',
          curator: '策展人 A',
          decidedAt: now - day * 19,
          evidenceAnalysisIds: ['analysis_seed_1'],
        },
        decisionHistory: [],
        createdAt: now - day * 40,
        updatedAt: now - day * 19,
      },
      {
        id: 'sample_seed_2',
        sampleNo: 'MET-2024-002',
        totalWeight: 8420,
        category: 'iron',
        chemicalGroup: 'IAB',
        weathering: 'W0',
        fallOrFind: 'find',
        storage: 'cabinet-b',
        note: '八面体结构清晰',
        classificationStatus: 'confirmed',
        classificationDecision: {
          category: 'iron',
          chemicalGroup: 'IAB',
          reason: 'Ni 7.4 wt% 且铁纹石带宽 0.62 mm，命中粗粒八面体铁陨石判据，宏观结构吻合，采信 IAB。',
          curator: '策展人 A',
          decidedAt: now - day * 11,
          evidenceAnalysisIds: ['analysis_seed_2'],
        },
        decisionHistory: [],
        createdAt: now - day * 30,
        updatedAt: now - day * 11,
      },
      {
        id: 'sample_seed_3',
        sampleNo: 'MET-2024-003',
        totalWeight: 318.9,
        category: 'achondrite',
        chemicalGroup: 'ungrouped',
        weathering: 'W2',
        fallOrFind: 'fall',
        storage: 'desiccator',
        note: '目击坠落，无熔壳；尚无检测依据，登记分类待复核',
        classificationStatus: 'pending-review',
        classificationDecision: null,
        decisionHistory: [],
        createdAt: now - day * 18,
        updatedAt: now - day * 18,
      },
      {
        id: 'sample_seed_4',
        sampleNo: 'MET-2024-004',
        totalWeight: 96.2,
        category: 'chondrite',
        chemicalGroup: 'LL',
        weathering: 'W1',
        fallOrFind: 'find',
        storage: 'loan-out',
        note: '两次检测建议冲突，原 H 群裁决已被新检测推翻，等待重新复核',
        classificationStatus: 'pending-review',
        classificationDecision: null,
        decisionHistory: [
          {
            category: 'chondrite',
            chemicalGroup: 'H',
            reason: '首次电子探针 Fa 17.8 / Fs 15.9、低 Ni，符合普通球粒陨石，暂归 H 群。',
            curator: '策展人 B',
            decidedAt: now - day * 16,
            evidenceAnalysisIds: ['analysis_seed_3'],
            supersededReason: 'new-conflict',
            supersededAt: now - day * 2,
            triggeredByAnalysisId: 'analysis_seed_4',
          },
        ],
        createdAt: now - day * 22,
        updatedAt: now - day * 2,
      },
    ]);
    await db.finds.bulkAdd([
      {
        id: 'find_seed_1',
        sampleId: 'sample_seed_1',
        placeName: 'Dar al Gani 区域',
        region: '利比亚',
        longitude: 16.2,
        latitude: 27.4,
        coordinateSource: 'gps',
        environment: 'desert',
        finder: '野外队 A 组',
        createdAt: now - 86400000 * 40,
      },
      {
        id: 'find_seed_2',
        sampleId: 'sample_seed_2',
        placeName: 'Gobi 南缘',
        region: '中国 内蒙古',
        longitude: 108.6,
        latitude: 42.1,
        coordinateSource: 'literature',
        environment: 'desert',
        finder: '标本室交换',
        createdAt: now - day * 30,
      },
      {
        id: 'find_seed_4',
        sampleId: 'sample_seed_4',
        placeName: 'Nullarbor 平原',
        region: '澳大利亚',
        longitude: 127.5,
        latitude: -30.6,
        coordinateSource: 'gps',
        environment: 'desert',
        finder: '野外队 C 组',
        createdAt: now - day * 22,
      },
    ]);
    await db.sections.bulkAdd([
      {
        id: 'section_seed_1',
        sectionNo: 'TS-2024-001',
        sampleId: 'sample_seed_1',
        thickness: 30,
        preparation: 'resin',
        minerals: { olivine: 42, pyroxene: 28, feldspar: 12, metal: 18 },
        micrographs: ['met001_ppl.jpg', 'met001_xpl.jpg'],
        quality: 'good',
        createdAt: now - 86400000 * 35,
      },
      {
        id: 'section_seed_2',
        sectionNo: 'TS-2024-002',
        sampleId: 'sample_seed_2',
        thickness: 60,
        preparation: 'epoxy',
        minerals: { olivine: 2, pyroxene: 5, feldspar: 1, metal: 92 },
        micrographs: ['met002_reflect.jpg'],
        quality: 'fair',
        createdAt: now - 86400000 * 25,
      },
    ]);
    await db.analysis.bulkAdd([
      stamp({
        id: 'analysis_seed_1',
        sampleId: 'sample_seed_1',
        target: 'sample',
        method: 'microprobe',
        fa: 18.6,
        fs: 16.2,
        ni: 0.8,
        kamaciteBandwidth: 0.02,
        testedAt: '2024-06-12',
        createdAt: now - day * 20,
      }),
      stamp({
        id: 'analysis_seed_2',
        sampleId: 'sample_seed_2',
        target: 'sample',
        method: 'sem-eds',
        fa: 3.2,
        fs: 4.1,
        ni: 7.4,
        kamaciteBandwidth: 0.62,
        testedAt: '2024-07-03',
        createdAt: now - day * 12,
      }),
      // 样本 4：首次检测偏 H 群球粒陨石（旧裁决依据）
      stamp({
        id: 'analysis_seed_3',
        sampleId: 'sample_seed_4',
        target: 'sample',
        method: 'microprobe',
        fa: 17.8,
        fs: 15.9,
        ni: 0.6,
        kamaciteBandwidth: 0.04,
        testedAt: '2024-08-15',
        createdAt: now - day * 17,
      }),
      // 样本 4：复测 Ni 升高、带宽增大，建议石铁陨石 → 与旧裁决冲突，样本重回待复核
      stamp({
        id: 'analysis_seed_4',
        sampleId: 'sample_seed_4',
        target: 'sample',
        method: 'sem-eds',
        fa: 14.2,
        fs: 13.1,
        ni: 6.3,
        kamaciteBandwidth: 0.31,
        testedAt: '2024-09-20',
        createdAt: now - day * 2,
      }),
    ]);
  });
}
