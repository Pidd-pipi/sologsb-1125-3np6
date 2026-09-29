import { summarizeReview, reconcileOnNewAnalysis, effectiveCategory } from '../src/utils/review';
import type { MeteoriteSample } from '../src/types/sample';
import type { AnalysisRecord } from '../src/types/analysis';

function mkSample(over: Partial<MeteoriteSample> = {}): MeteoriteSample {
  return {
    id: 's1',
    sampleNo: 'MET-2024-001',
    totalWeight: 100,
    category: 'chondrite',
    chemicalGroup: 'H',
    weathering: 'W1',
    fallOrFind: 'find',
    storage: 'cabinet-a',
    classificationStatus: 'pending-review',
    classificationDecision: null,
    decisionHistory: [],
    createdAt: 0,
    updatedAt: 0,
    ...over,
  };
}

function mkAnalysis(id: string, vals: Partial<AnalysisRecord> = {}, createdAt = 1): AnalysisRecord {
  return {
    id,
    sampleId: 's1',
    target: 'sample',
    method: 'microprobe',
    fa: 18,
    fs: 16,
    ni: 0.5,
    kamaciteBandwidth: 0.05,
    testedAt: '2024-01-01',
    createdAt,
    ...vals,
  };
}

let failures = 0;
function assert(cond: boolean, msg: string) {
  if (!cond) {
    failures++;
    console.error('FAIL:', msg);
  } else {
    console.log('ok:', msg);
  }
}

// 1. 无检测 → 待复核
const s0 = mkSample();
const r0 = summarizeReview(s0, []);
assert(r0.status === 'pending-review', '无检测时待复核');
assert(effectiveCategory(s0) === null, '无检测时无生效分类');

// 2. 单条检测、无裁决 → 待复核，不自动采信
const a1 = mkAnalysis('a1');
const r1 = summarizeReview(s0, [a1]);
assert(r1.status === 'pending-review' && r1.consensusCategory === 'chondrite', '单条球粒意见：待复核且共识为球粒');

// 3. 两条一致检测 → 仍待复核（需策展人采信）
const a2 = mkAnalysis('a2', { fa: 20, fs: 18 });
const r2 = summarizeReview(s0, [a1, a2]);
assert(r2.status === 'pending-review' && !r2.hasConflict, '意见一致仍需策展人采信');

// 4. 分歧检测 → hasConflict
const a3 = mkAnalysis('a3', { fa: 3, fs: 4, ni: 7, kamaciteBandwidth: 0.6, method: 'sem-eds' });
const r3 = summarizeReview(s0, [a1, a3]);
assert(r3.hasConflict && r3.adviceCategories.length === 2, '检测意见分歧被识别');
assert(r3.pendingReason?.includes('不一致'), '待复核原因为意见分歧');

// 5. 已确认裁决 + 一致检测 → confirmed，生效分类采信
const confirmed = mkSample({
  classificationStatus: 'confirmed',
  classificationDecision: {
    category: 'chondrite',
    chemicalGroup: 'H',
    reason: '证据充分',
    decidedAt: 100,
    evidenceAnalysisIds: ['a1', 'a2'],
  },
});
const r5 = summarizeReview(confirmed, [a1, a2]);
assert(r5.status === 'confirmed', '已确认且无冲突 → confirmed');
assert(effectiveCategory(confirmed) === 'chondrite', '生效分类取裁决');

// 6. 新检测与已确认裁决冲突 → 重回待复核，旧裁决归档
const ironRecord = mkAnalysis('a4', { fa: 3, fs: 4, ni: 8, kamaciteBandwidth: 0.7 });
const patch = reconcileOnNewAnalysis(confirmed, ironRecord, 999);
assert(patch !== null, '冲突新检测触发重开');
assert(patch?.classificationStatus === 'pending-review', '补丁状态为待复核');
assert(patch?.classificationDecision === null, '当前裁决被清空');
assert(patch?.decisionHistory?.length === 1, '旧裁决进入历史');
assert(patch?.decisionHistory?.[0].supersededReason === 'new-conflict', '归档原因 new-conflict');
assert(patch?.decisionHistory?.[0].triggeredByAnalysisId === 'a4', '归档记录触发来源');
// 旧判断与理由仍可查
assert(patch?.decisionHistory?.[0].reason === '证据充分', '旧裁决理由保留');
assert(patch?.decisionHistory?.[0].evidenceAnalysisIds.includes('a1'), '旧裁决引用依据保留');

const reopened = { ...confirmed, ...(patch as Partial<MeteoriteSample>) };
const r6 = summarizeReview(reopened, [a1, a2, ironRecord]);
assert(r6.status === 'pending-review', '旧裁决归档后实时状态为待复核');
assert(r6.hasConflict && r6.adviceCategories.includes('iron'), '冲突检测意见保留在汇总中');
// 仅检测冲突、补丁尚未持久化的瞬时状态下也应识别为重开
const r6b = summarizeReview(confirmed, [a1, a2, ironRecord]);
assert(r6b.status === 'pending-review' && r6b.reopenedByAnalysis, 'confirmed 遇冲突检测瞬时识别为重开');

// 7. 新检测与裁决一致 → 不重开
const same = mkAnalysis('a5', { fa: 19, fs: 17 });
const patch7 = reconcileOnNewAnalysis(confirmed, same, 999);
assert(patch7 === null, '一致新检测不推翻裁决');

// 8. 快照固化：修改规则后仍读保存值
const stale = mkAnalysis('a6', { evaluation: { advice: { category: 'iron', confidence: 'high', summary: '旧规则', hits: [] }, hits: [] } });
const r8 = summarizeReview(s0, [stale]);
assert(r8.entries[0].evaluation.advice.category === 'iron' && r8.entries[0].evaluation.advice.summary === '旧规则', '检测读取保存时固化快照');

// 9. 旧记录无快照 → 懒补算
const legacy = mkAnalysis('a7', { fa: 2, fs: 3, ni: 9, kamaciteBandwidth: 0.8 });
const r9 = summarizeReview(s0, [legacy]);
assert(r9.entries[0].evaluation.advice.category === 'iron', '旧检测缺快照时按当前规则补算');
assert(r9.entries[0].evaluation.hits.length === 4, '旧检测补算含 4 项阈值命中');

if (failures) {
  console.error(`\n${failures} 项失败`);
  process.exit(1);
} else {
  console.log('\n全部通过');
}
