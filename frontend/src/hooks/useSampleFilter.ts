import { useMemo } from 'react';
import type { MeteoriteSample } from '../types/sample';
import { useSampleStore } from '../stores/sampleStore';
import { useUiStore } from '../stores/uiStore';
import { effectiveCategory, effectiveChemicalGroup } from '../utils/review';

/**
 * 管理分类、化学群、重量区间与关键词筛选并返回结果集。
 * 被 / 与 /sections 消费。
 *
 * 分类 / 化学群筛选只匹配策展人已确认的生效分类；待复核样本的登记初判
 * 不被采信，因此不会命中分类条件（可通过「只看待复核」单独筛出）。
 */
export function useSampleFilter(override?: Partial<{ category: string; group: string }>) {
  const samples = useSampleStore((s) => s.samples);
  const categories = useUiStore((s) => s.categories);
  const groups = useUiStore((s) => s.groups);
  const reviewOnly = useUiStore((s) => s.reviewOnly);
  const minWeight = useUiStore((s) => s.minWeight);
  const maxWeight = useUiStore((s) => s.maxWeight);
  const keyword = useUiStore((s) => s.keyword);
  const sort = useUiStore((s) => s.sort);

  const results = useMemo(() => {
    const kw = keyword.trim().toLowerCase();
    const list = samples.filter((s) => {
      const effCategory = effectiveCategory(s);
      const effGroup = effectiveChemicalGroup(s);
      if (reviewOnly && effCategory !== null) return false;
      if (categories.length) {
        if (!effCategory || !categories.includes(effCategory)) return false;
      }
      if (groups.length) {
        if (!effGroup || !groups.includes(effGroup)) return false;
      }
      if (minWeight !== null && s.totalWeight < minWeight) return false;
      if (maxWeight !== null && s.totalWeight > maxWeight) return false;
      if (override?.category && effCategory !== override.category) return false;
      if (override?.group && effGroup !== override.group) return false;
      if (kw) {
        const hay = `${s.sampleNo} ${s.note ?? ''}`.toLowerCase();
        if (!hay.includes(kw)) return false;
      }
      return true;
    });
    return sortSamples(list, sort);
  }, [
    samples,
    categories,
    groups,
    reviewOnly,
    minWeight,
    maxWeight,
    keyword,
    sort,
    override?.category,
    override?.group,
  ]);

  return {
    results,
    total: samples.length,
    activeCount:
      categories.length +
      groups.length +
      (reviewOnly ? 1 : 0) +
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
