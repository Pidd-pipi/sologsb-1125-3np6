import { useMemo } from 'react';
import { useSampleStore } from '../stores/sampleStore';
import type { SampleCategory } from '../types/sample';
import { effectiveCategory } from '../utils/review';

export interface RegionStat {
  region: string;
  sampleCount: number;
  totalWeight: number;
  categories: Record<string, number>;
  points: { sampleId: string; longitude: number; latitude: number; category: SampleCategory | null }[];
}

/** 按国家地区聚合样本数与总重量，被 /locations 消费；分类只统计已确认的生效分类 */
export function useRegionStats() {
  const finds = useSampleStore((s) => s.finds);
  const samples = useSampleStore((s) => s.samples);

  return useMemo(() => {
    const sampleMap = new Map(samples.map((s) => [s.id, s]));
    const map = new Map<string, RegionStat>();
    for (const f of finds) {
      const sample = sampleMap.get(f.sampleId);
      const region = f.region?.trim() || '未标注地区';
      const entry =
        map.get(region) ??
        ({ region, sampleCount: 0, totalWeight: 0, categories: {}, points: [] } as RegionStat);
      entry.sampleCount += 1;
      entry.totalWeight += sample?.totalWeight ?? 0;
      if (sample) {
        const category = effectiveCategory(sample);
        if (category) entry.categories[category] = (entry.categories[category] ?? 0) + 1;
        entry.points.push({
          sampleId: sample.id,
          longitude: f.longitude,
          latitude: f.latitude,
          category,
        });
      }
      map.set(region, entry);
    }
    const stats = Array.from(map.values()).sort((a, b) => b.sampleCount - a.sampleCount);
    const totalSamples = stats.reduce((n, s) => n + s.sampleCount, 0);
    const totalWeight = stats.reduce((n, s) => n + s.totalWeight, 0);
    const maxCount = stats.length ? Math.max(...stats.map((s) => s.sampleCount)) : 0;
    return { stats, totalSamples, totalWeight, maxCount };
  }, [finds, samples]);
}
