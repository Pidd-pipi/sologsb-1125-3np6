import fakeIndexedDB, { IDBKeyRange } from 'fake-indexeddb';
(globalThis as { indexedDB?: unknown }).indexedDB = fakeIndexedDB;
(globalThis as { IDBKeyRange?: unknown }).IDBKeyRange = IDBKeyRange;

const { db } = await import('../src/db');
const { useSampleStore } = await import('../src/stores/sampleStore');

let failures = 0;
function assert(cond: boolean, msg: string) {
  if (!cond) {
    failures++;
    console.error('FAIL:', msg);
  } else console.log('ok:', msg);
}

async function resetDb() {
  db.close();
  // 清掉 fake-indexeddb 内的全部数据库
  const names = (await fakeIndexedDB.databases()).map((d) => d.name).filter(Boolean) as string[];
  await Promise.all(
    names.map(
      (name) =>
        new Promise<void>((resolve, reject) => {
          const req = fakeIndexedDB.deleteDatabase(name);
          req.onsuccess = () => resolve();
          req.onerror = () => reject(req.error);
        }),
    ),
  );
  await db.open();
  useSampleStore.setState({ samples: [], finds: [], sections: [], analysis: [], loaded: false });
}

await resetDb();

// 新登记样本默认为待复核
const store = useSampleStore.getState();
const sampleId = await store.addSample({
  sampleNo: 'MET-2026-001',
  totalWeight: 100,
  category: 'chondrite',
  chemicalGroup: 'H',
  weathering: 'W1',
  fallOrFind: 'find',
  storage: 'cabinet-a',
});
assert(
  useSampleStore.getState().samples[0].classificationStatus === 'pending-review',
  '新登记样本默认为待复核',
);

// 第一条检测：球粒
const r1 = await useSampleStore.getState().addAnalysis({
  sampleId, target: 'sample', method: 'microprobe',
  fa: 18, fs: 16, ni: 0.5, kamaciteBandwidth: 0.05, testedAt: '2026-01-01',
});
assert(!r1.reopened && !r1.hasConflict, '首条检测无分歧不重开');

// 策展人确认为球粒 H
await useSampleStore.getState().confirmClassification(sampleId, {
  category: 'chondrite', chemicalGroup: 'H', reason: 'Fa/Fs 典型 H 群', curator: 'C',
});
let s = useSampleStore.getState().samples.find((x) => x.id === sampleId)!;
assert(s.classificationStatus === 'confirmed', '裁决后已确认');

// 一致的新检测不推翻
const r2 = await useSampleStore.getState().addAnalysis({
  sampleId, target: 'sample', method: 'microprobe',
  fa: 19, fs: 17, ni: 0.6, kamaciteBandwidth: 0.04, testedAt: '2026-02-01',
});
assert(!r2.reopened, '一致检测不推翻已确认结果');
s = useSampleStore.getState().samples.find((x) => x.id === sampleId)!;
assert(s.classificationStatus === 'confirmed', '裁决保持 confirmed');

// 冲突检测：高 Ni 粗带宽 → 铁陨石
const r3 = await useSampleStore.getState().addAnalysis({
  sampleId, target: 'sample', method: 'sem-eds',
  fa: 3, fs: 4, ni: 9, kamaciteBandwidth: 0.8, testedAt: '2026-03-01',
});
assert(r3.reopened && r3.hasConflict, '冲突检测触发重开并报告分歧');
s = useSampleStore.getState().samples.find((x) => x.id === sampleId)!;
assert(s.classificationStatus === 'pending-review', '样本重回待复核');
assert(s.classificationDecision === null, '当前裁决清空');
assert((s.decisionHistory ?? []).length === 1, '旧裁决归档 1 条');
assert(s.decisionHistory?.[0].category === 'chondrite', '归档的是旧球粒裁决');
assert(s.decisionHistory?.[0].supersededReason === 'new-conflict', '归档原因为新检测冲突');
assert(s.decisionHistory?.[0].reason === 'Fa/Fs 典型 H 群', '旧选择理由继续可查');
assert(s.decisionHistory?.[0].evidenceAnalysisIds.length === 1, '旧裁决引用的检测依据保留');

// 数据已落库（刷新后状态保持）
await db.samples.get(sampleId).then((rec) => {
  assert(rec?.classificationStatus === 'pending-review', '待复核状态已持久化');
  assert((rec?.decisionHistory ?? []).length === 1, '历史裁决已持久化');
});

// 检测记录带固化快照
const analyses = useSampleStore.getState().analysis;
assert(analyses.every((a) => !!a.evaluation), '所有检测记录保存评估快照');
assert(analyses[0].evaluation!.hits.length === 4, '快照含 4 项阈值命中');

// 策展人重新裁决为铁陨石
await useSampleStore.getState().confirmClassification(sampleId, {
  category: 'iron', chemicalGroup: 'IAB', reason: '高 Ni 粗带宽，铁陨石证据充分',
});
s = useSampleStore.getState().samples.find((x) => x.id === sampleId)!;
assert(s.classificationStatus === 'confirmed' && s.classificationDecision?.category === 'iron', '重新裁决为铁陨石');
assert((s.decisionHistory ?? []).length === 1, '重新裁决不重复归档（旧裁决此前已归档）');

db.close();
if (failures) {
  console.error(`\n${failures} 项失败`);
  process.exit(1);
}
console.log('\nStore 流程全部通过');
