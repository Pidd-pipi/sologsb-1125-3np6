import { Chip, Stack, Tooltip } from '@mui/material';
import {
  CATEGORY_LABELS,
  CHEMICAL_GROUP_LABELS,
  CLASSIFICATION_STATUS_LABELS,
  type ChemicalGroup,
  type MeteoriteSample,
  type SampleCategory,
} from '../../types/sample';
import type { AnalysisRecord } from '../../types/analysis';
import { categoryColor } from '../../utils/format';
import { effectiveCategory, effectiveChemicalGroup, summarizeReview } from '../../utils/review';

interface ClassificationBadgeProps {
  category: SampleCategory;
  group?: ChemicalGroup;
  size?: 'small' | 'medium';
  showGroup?: boolean;
}

/** 分类与化学群着色标签：被 / 、/analysis、/locations 消费 */
export function ClassificationBadge({
  category,
  group,
  size = 'small',
  showGroup = true,
}: ClassificationBadgeProps) {
  const color = categoryColor(category);
  return (
    <Stack direction="row" spacing={0.75} alignItems="center" flexWrap="wrap" useFlexGap>
      <Chip
        size={size}
        label={CATEGORY_LABELS[category] ?? category}
        sx={{
          bgcolor: color,
          color: '#fff',
          fontWeight: 600,
          letterSpacing: '0.02em',
          '& .MuiChip-label': { px: 1 },
        }}
      />
      {showGroup && group ? (
        <Tooltip title="化学群">
          <Chip
            size={size}
            variant="outlined"
            label={CHEMICAL_GROUP_LABELS[group] ?? group}
            sx={{ borderColor: color, color: 'text.primary', '& .MuiChip-label': { px: 1 } }}
          />
        </Tooltip>
      ) : null}
    </Stack>
  );
}

/** 待复核角标；可选 tooltip 展示待复核原因 */
export function ReviewStatusChip({
  status,
  reason,
  size = 'small',
}: {
  status: 'pending-review' | 'confirmed';
  reason?: string | null;
  size?: 'small' | 'medium';
}) {
  if (status === 'confirmed') {
    return (
      <Tooltip title="已经策展人复核确认，详情、总览与筛选均采用该结果">
        <Chip
          size={size}
          color="success"
          variant="outlined"
          label={CLASSIFICATION_STATUS_LABELS.confirmed}
        />
      </Tooltip>
    );
  }
  const label = CLASSIFICATION_STATUS_LABELS['pending-review'];
  return (
    <Chip
      size={size}
      color="warning"
      label={reason ? `${label}：${reason}` : label}
      sx={
        reason
          ? {
              height: 'auto',
              '& .MuiChip-label': { whiteSpace: 'normal', py: 0.5, lineHeight: 1.4 },
            }
          : undefined
      }
    />
  );
}

interface EffectiveClassificationBadgeProps {
  sample: MeteoriteSample;
  /** 传入检测列表时实时重算（用于已确认结果被新检测推翻但尚未刷新的场景） */
  analysis?: AnalysisRecord[];
  size?: 'small' | 'medium';
  showGroup?: boolean;
  /** 是否同时渲染待复核/已确认角标，默认 true */
  showStatus?: boolean;
}

/**
 * 生效分类徽标：只采信策展人已确认的裁决。
 * 待复核样本不显示旧的登记分类，仅显示「待复核」角标（详情页另展示初判）。
 */
export function EffectiveClassificationBadge({
  sample,
  analysis,
  size = 'small',
  showGroup = true,
  showStatus = true,
}: EffectiveClassificationBadgeProps) {
  // 传入检测列表时实时重算，可识别「已确认结果被新检测推翻」的过渡状态
  const summary = analysis ? summarizeReview(sample, analysis) : null;
  const confirmed = summary ? summary.status === 'confirmed' : sample.classificationStatus === 'confirmed';
  const category = confirmed ? effectiveCategory(sample) : null;
  const group = confirmed ? effectiveChemicalGroup(sample) : null;

  return (
    <Stack direction="row" spacing={0.75} alignItems="center" flexWrap="wrap" useFlexGap>
      {category ? (
        <ClassificationBadge category={category} group={group ?? undefined} size={size} showGroup={showGroup} />
      ) : (
        <Tooltip title="检测意见尚未经策展人采信，分类暂不生效，不参与分类/化学群筛选">
          <Chip
            size={size}
            variant="outlined"
            label="分类待复核"
            sx={{ borderStyle: 'dashed', color: 'warning.dark' }}
          />
        </Tooltip>
      )}
      {showStatus ? (
        <ReviewStatusChip
          status={category ? 'confirmed' : 'pending-review'}
          reason={size === 'small' ? null : summary?.pendingReason ?? null}
          size={size}
        />
      ) : null}
    </Stack>
  );
}

export default ClassificationBadge;
