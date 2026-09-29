import { useMemo } from 'react';
import { useSampleStore } from '../stores/sampleStore';
import { classificationOf, type SampleClassification } from '../utils/classify';
import type { MeteoriteSample } from '../types/sample';

/**
 * 按 sampleId 聚合各样本的全部检测记录，产出当前分类复核结论。
 * 详情 / 总览 / 卡片 / 筛选 / 地图统一消费这份映射，避免各处各算各的。
 */
export function useClassificationMap(): Map<string, SampleClassification> {
  const samples = useSampleStore((s) => s.samples);
  const analysis = useSampleStore((s) => s.analysis);

  return useMemo(() => {
    const bySample = new Map<string, typeof analysis>();
    for (const rec of analysis) {
      const list = bySample.get(rec.sampleId) ?? [];
      list.push(rec);
      bySample.set(rec.sampleId, list);
    }
    const map = new Map<string, SampleClassification>();
    for (const sample of samples) {
      map.set(sample.id, classificationOf(sample, bySample.get(sample.id) ?? []));
    }
    return map;
  }, [samples, analysis]);
}

/** 单个样本的分类复核结论（供详情页直接取用） */
export function useSampleClassification(sample?: MeteoriteSample): SampleClassification | undefined {
  const map = useClassificationMap();
  return sample ? map.get(sample.id) : undefined;
}
