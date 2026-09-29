import fakeIndexedDB, { IDBKeyRange } from 'fake-indexeddb';
(globalThis as { indexedDB?: unknown }).indexedDB = fakeIndexedDB;
(globalThis as { IDBKeyRange?: unknown }).IDBKeyRange = IDBKeyRange;
const { db, seedIfEmpty } = await import('../src/db');
const { default: Dexie } = await import('dexie');

let failures = 0;
function assert(cond: boolean, msg: string) {
  if (!cond) {
    failures++;
    console.error('FAIL:', msg);
  } else console.log('ok:', msg);
}

async function buildV3Database() {
  // 删掉自动实例，按 v3 旧结构手工建库并灌入旧形态数据
  db.close();
  await new Promise<void>((resolve, reject) => {
    const req = indexedDB.deleteDatabase('gbmeteorite-db');
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
    req.onblocked = () => reject(new Error('blocked'));
  });

  const old = new Dexie('gbmeteorite-db');
  old.version(1).stores({
    samples: 'id, sampleNo, category, chemicalGroup, totalWeight, createdAt',
    finds: 'id, sampleId, region, createdAt',
    sections: 'id, sectionNo, sampleId, thickness, createdAt',
  });
  old.version(2).stores({
    samples: 'id, sampleNo, category, chemicalGroup, totalWeight, createdAt',
    finds: 'id, sampleId, region, createdAt',
    sections: 'id, sectionNo, sampleId, thickness, createdAt',
    analysis: 'id, sampleId, sectionId, method, testedAt, createdAt',
  });
  old.version(3).stores({
    samples: 'id, sampleNo, category, chemicalGroup, totalWeight, createdAt, updatedAt',
    finds: 'id, sampleId, region, createdAt',
    sections: 'id, sectionNo, sampleId, thickness, createdAt',
    analysis: 'id, sampleId, sectionId, method, testedAt, createdAt',
  });

  const now = Date.now();
  await old.table('samples').bulkAdd([
    // 旧记录：无复核字段
    {
      id: 'old_1',
      sampleNo: 'MET-2023-001',
      totalWeight: 500,
      category: 'iron',
      chemicalGroup: 'IAB',
      weathering: 'W0',
      fallOrFind: 'find',
      storage: 'cabinet-b',
      createdAt: now,
      updatedAt: now,
    },
  ]);
  await old.table('analysis').bulkAdd([
    // 旧检测：无评估快照
    {
      id: 'old_a1',
      sampleId: 'old_1',
      target: 'sample',
      method: 'sem-eds',
      fa: 4,
      fs: 5,
      ni: 9,
      kamaciteBandwidth: 0.66,
      testedAt: '2023-05-01',
      createdAt: now,
    },
  ]);
  old.close();
}

async function main() {
  await buildV3Database();

  // 重新打开 v4 实例，触发升级迁移
  db.open();
  await db.open();

  const sample = await db.samples.get('old_1');
  assert(sample?.classificationStatus === 'pending-review', 'v4 迁移：旧样本转为待复核');
  assert(sample?.classificationDecision === null, 'v4 迁移：旧样本无生效裁决');
  assert(Array.isArray(sample?.decisionHistory), 'v4 迁移：初始化裁决历史数组');
  assert(sample?.category === 'iron', 'v4 迁移：登记分类保留为初判');

  const analysis = await db.table('analysis').get('old_a1');
  assert(!!analysis.evaluation, 'v4 迁移：旧检测补算评估快照');
  assert(analysis.evaluation.advice.category === 'iron', 'v4 迁移：补算建议为铁陨石');
  assert(analysis.evaluation.hits.length === 4, 'v4 迁移：快照含 4 项阈值命中');
  assert(analysis.evaluation.hits[2].key === 'ni', 'v4 迁移：Ni 命中项保留');

  // 全新库的种子数据
  db.close();
  await new Promise<void>((resolve) => {
    const req = indexedDB.deleteDatabase('gbmeteorite-db');
    req.onsuccess = () => resolve();
  });
  await db.open();
  await seedIfEmpty();
  const samples = await db.samples.toArray();
  assert(samples.length === 4, '种子：灌入 4 份样本');
  const s1 = samples.find((s) => s.id === 'sample_seed_1');
  const s4 = samples.find((s) => s.id === 'sample_seed_4');
  assert(s1?.classificationStatus === 'confirmed', '种子：样本1 已确认');
  assert(s4?.classificationStatus === 'pending-review', '种子：样本4 待复核');
  assert((s4?.decisionHistory ?? []).length === 1, '种子：样本4 保留 1 条被推翻的历史裁决');
  assert(
    s4?.decisionHistory?.[0].supersededReason === 'new-conflict',
    '种子：历史裁决标记为新检测推翻',
  );
  const a4 = await db.analysis.get('analysis_seed_4');
  assert(!!a4?.evaluation, '种子：新检测带评估快照');
  assert(a4.evaluation.advice.category === 'stony-iron', '种子：复测建议石铁陨石');

  if (failures) {
    console.error(`\n${failures} 项失败`);
    process.exit(1);
  }
  console.log('\n迁移与种子全部通过');
  db.close();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
