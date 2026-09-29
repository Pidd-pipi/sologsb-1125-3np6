import { useMemo } from 'react';
import type { MeteoriteSample } from '../types/sample';
import { useClassificationMap } from './useClassification';
import { useSampleStore } from '../stores/sampleStore';
import { useUiStore } from '../stores/uiStore';

/**
 * 管理分类、化学群、重量区间与关键词筛选并返回结果集。
 * 被 / 与 /sections 消费。
 *
 * 分类 / 化学群按「当前对外采用的结果」过滤：
 * 策展核定生效时取核定值；尚无检测时取登记初判；待复核期间不采用任何结果，
 * 不会落入任何具体分类，只由「待复核」开关命中。
 */
export function useSampleFilter(override?: Partial<{ category: string; group: string }>) {
  const samples = useSampleStore((s) => s.samples);
  const classificationMap = useClassificationMap();
  const categories = useUiStore((s) => s.categories);
  const groups = useUiStore((s) => s.groups);
  const pendingOnly = useUiStore((s) => s.pendingOnly);
  const minWeight = useUiStore((s) => s.minWeight);
  const maxWeight = useUiStore((s) => s.maxWeight);
  const keyword = useUiStore((s) => s.keyword);
  const sort = useUiStore((s) => s.sort);

  const results = useMemo(() => {
    const kw = keyword.trim().toLowerCase();
    const list = samples.filter((s) => {
      const cls = classificationMap.get(s.id);
      const effectiveCategory = cls?.effectiveCategory ?? null;
      const effectiveGroup = cls?.effectiveGroup ?? null;
      const isPending = cls?.status === 'pending';

      if (pendingOnly && !isPending) return false;
      if (categories.length && (effectiveCategory === null || !categories.includes(effectiveCategory)))
        return false;
      if (groups.length && (effectiveGroup === null || !groups.includes(effectiveGroup))) return false;
      if (minWeight !== null && s.totalWeight < minWeight) return false;
      if (maxWeight !== null && s.totalWeight > maxWeight) return false;
      if (override?.category && effectiveCategory !== override.category) return false;
      if (override?.group && effectiveGroup !== override.group) return false;
      if (kw) {
        const hay = `${s.sampleNo} ${s.note ?? ''}`.toLowerCase();
        if (!hay.includes(kw)) return false;
      }
      return true;
    });
    return sortSamples(list, sort);
  }, [
    samples,
    classificationMap,
    categories,
    groups,
    pendingOnly,
    minWeight,
    maxWeight,
    keyword,
    sort,
    override?.category,
    override?.group,
  ]);

  const pendingCount = useMemo(
    () => Array.from(classificationMap.values()).filter((c) => c.status === 'pending').length,
    [classificationMap],
  );

  return {
    results,
    total: samples.length,
    pendingCount,
    activeCount:
      categories.length +
      groups.length +
      (pendingOnly ? 1 : 0) +
      (minWeight !== null || maxWeight !== null ? 1 : 0) +
      (keyword.trim() ? 1 : 0),
  };
}

export function sortSamples(list: MeteoriteSample[], sort: string): MeteoriteSample[] {
  const copy = [...list];
  switch (sort) {
    case 'totalWeight':
      return copy.sort((a, b) => b.totalWeight - a.totalWeight);
    case 'sampleNo':
      return copy.sort((a, b) => a.sampleNo.localeCompare(b.sampleNo));
    default:
      return copy.sort((a, b) => b.createdAt - a.createdAt);
  }
}
