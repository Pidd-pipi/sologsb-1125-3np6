import Dexie, { type Table } from 'dexie';
import type { MeteoriteSample } from '../types/sample';
import type { FindRecord } from '../types/find';
import type { ThinSection } from '../types/section';
import type { AnalysisRecord } from '../types/analysis';
import { snapshotEvaluation } from '../utils/classify';

/** 库名固定为 gbmeteorite-db */
export const DB_NAME = 'gbmeteorite-db';

/**
 * 版本历史（IndexedDB 升级迁移）：
 *  - v1：建 samples / finds / sections 三张表
 *  - v2：新增 analysis 表，并为 analysis 加 sampleId 索引
 *  - v3：为 samples 补 updatedAt 字段，并按 id 回填旧记录
 *  - v4：检测记录固化各自的阈值命中/分类建议快照，样本挂分类核定历史
 *       （字段均为可选，旧记录在升级事务里按当前规则回填 evaluation）
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
        // v4：为旧检测记录回填阈值命中与分类建议快照，使历史依据不随后续规则变化而变
        await tx
          .table<AnalysisRecord, string>('analysis')
          .toCollection()
          .modify((rec) => {
            if (!rec.evaluation) {
              rec.evaluation = snapshotEvaluation(rec);
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
        classificationDecisions: [
          {
            id: 'decision_seed_1',
            decidedAt: now - 86400000 * 18,
            category: 'chondrite',
            chemicalGroup: 'H',
            reason: '电子探针 Fa/Fs 落入 H 群普通球粒区间，Ni 低于 1 wt%，与切片矿物占比相符，予以确认。',
            basedOnAnalysisIds: ['analysis_seed_1'],
            status: 'active',
          },
        ],
        createdAt: now - 86400000 * 40,
        updatedAt: now - 86400000 * 18,
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
        classificationDecisions: [
          {
            id: 'decision_seed_2',
            decidedAt: now - 86400000 * 10,
            category: 'iron',
            chemicalGroup: 'IAB',
            reason: 'Ni 7.4 wt% 且铁纹石带宽 0.62 mm 指示粗粒八面体铁陨石，金属占比 92%，定为 IAB。',
            basedOnAnalysisIds: ['analysis_seed_2'],
            status: 'active',
          },
        ],
        createdAt: now - 86400000 * 30,
        updatedAt: now - 86400000 * 10,
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
        note: '目击坠落，无熔壳；分类为登记初判，尚无检测记录',
        createdAt: now - 86400000 * 18,
        updatedAt: now - 86400000 * 18,
      },
      {
        id: 'sample_seed_4',
        sampleNo: 'MET-2024-004',
        totalWeight: 672.5,
        category: 'achondrite',
        chemicalGroup: 'ungrouped',
        weathering: 'W2',
        fallOrFind: 'find',
        storage: 'cabinet-a',
        note: '前后两次检测结论冲突，旧判断已被新检测推翻，等待重新复核',
        // 无 active 核定：末条已失效，样本回到待复核
        classificationDecisions: [
          {
            id: 'decision_seed_4a',
            decidedAt: now - 86400000 * 9,
            category: 'achondrite',
            chemicalGroup: 'ungrouped',
            reason: '首检 Fa 偏低、Fs-Fa 差值大，按非平衡无球粒陨石暂定，等待补测。',
            basedOnAnalysisIds: ['analysis_seed_3', 'analysis_seed_4'],
            status: 'superseded',
            supersededAt: now - 86400000 * 2,
            supersedeReason: 'new-analysis',
            supersedeAnalysisId: 'analysis_seed_5',
          },
        ],
        createdAt: now - 86400000 * 15,
        updatedAt: now - 86400000 * 2,
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
        createdAt: now - 86400000 * 30,
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
      {
        id: 'analysis_seed_1',
        sampleId: 'sample_seed_1',
        target: 'sample',
        method: 'microprobe',
        fa: 18.6,
        fs: 16.2,
        ni: 0.8,
        kamaciteBandwidth: 0.02,
        testedAt: '2024-06-12',
        evaluation: snapshotEvaluation({ fa: 18.6, fs: 16.2, ni: 0.8, kamaciteBandwidth: 0.02 }),
        createdAt: now - 86400000 * 20,
      },
      {
        id: 'analysis_seed_2',
        sampleId: 'sample_seed_2',
        target: 'sample',
        method: 'sem-eds',
        fa: 3.2,
        fs: 4.1,
        ni: 7.4,
        kamaciteBandwidth: 0.62,
        testedAt: '2024-07-03',
        evaluation: snapshotEvaluation({ fa: 3.2, fs: 4.1, ni: 7.4, kamaciteBandwidth: 0.62 }),
        createdAt: now - 86400000 * 12,
      },
      {
        id: 'analysis_seed_3',
        sampleId: 'sample_seed_4',
        target: 'sample',
        method: 'microprobe',
        fa: 8.1,
        fs: 17.5,
        ni: 0.3,
        kamaciteBandwidth: 0,
        testedAt: '2024-07-18',
        evaluation: snapshotEvaluation({ fa: 8.1, fs: 17.5, ni: 0.3, kamaciteBandwidth: 0 }),
        createdAt: now - 86400000 * 12,
      },
      {
        id: 'analysis_seed_4',
        sampleId: 'sample_seed_4',
        target: 'sample',
        method: 'sem-eds',
        fa: 9.4,
        fs: 18.0,
        ni: 0.4,
        kamaciteBandwidth: 0,
        testedAt: '2024-07-22',
        evaluation: snapshotEvaluation({ fa: 9.4, fs: 18.0, ni: 0.4, kamaciteBandwidth: 0 }),
        createdAt: now - 86400000 * 11,
      },
      {
        id: 'analysis_seed_5',
        sampleId: 'sample_seed_4',
        target: 'sample',
        method: 'microprobe',
        fa: 19.8,
        fs: 17.1,
        ni: 0.6,
        kamaciteBandwidth: 0.04,
        testedAt: '2024-09-10',
        evaluation: snapshotEvaluation({ fa: 19.8, fs: 17.1, ni: 0.6, kamaciteBandwidth: 0.04 }),
        createdAt: now - 86400000 * 2,
      },
    ]);
  });
}
