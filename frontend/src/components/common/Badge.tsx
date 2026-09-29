import { Chip, Stack, Tooltip } from '@mui/material';
import {
  CATEGORY_LABELS,
  CHEMICAL_GROUP_LABELS,
  type ChemicalGroup,
  type SampleCategory,
} from '../../types/sample';
import { categoryColor } from '../../utils/format';

interface ClassificationBadgeProps {
  /** 对外采用的分类；待复核期间未定时传 null */
  category: SampleCategory | null;
  group?: ChemicalGroup | null;
  size?: 'small' | 'medium';
  showGroup?: boolean;
  /** null 分类时的占位文案 */
  pendingLabel?: string;
}

/** 分类与化学群着色标签：被 / 、/analysis、/locations 消费 */
export function ClassificationBadge({
  category,
  group,
  size = 'small',
  showGroup = true,
  pendingLabel = '分类待复核',
}: ClassificationBadgeProps) {
  if (category === null) {
    return (
      <Stack direction="row" spacing={0.75} alignItems="center" flexWrap="wrap" useFlexGap>
        <Tooltip title="检测意见尚未经策展核定，暂不采用任何分类">
          <Chip
            size={size}
            label={pendingLabel}
            sx={{
              bgcolor: 'rgba(237,108,2,0.10)',
              color: 'warning.dark',
              fontWeight: 600,
              letterSpacing: '0.02em',
              '& .MuiChip-label': { px: 1 },
            }}
          />
        </Tooltip>
      </Stack>
    );
  }

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

export default ClassificationBadge;
