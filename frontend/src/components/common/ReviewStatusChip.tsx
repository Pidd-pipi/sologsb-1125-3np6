import { Chip } from '@mui/material';
import type { ClassificationReviewStatus } from '../../types/sample';

interface ReviewStatusChipProps {
  status: ClassificationReviewStatus;
  /** pending 时各检测建议是否出现分歧（区分「待复核」与「待确认」） */
  disagreement?: boolean;
  size?: 'small' | 'medium';
}

/** 分类复核状态角标：待复核（分歧）/ 待确认（建议一致）/ 已确认 / 初判（尚无检测） */
export function ReviewStatusChip({ status, disagreement = false, size = 'small' }: ReviewStatusChipProps) {
  if (status === 'confirmed') {
    return <Chip size={size} color="success" variant="outlined" label="分类已确认" />;
  }
  if (status === 'pending') {
    return (
      <Chip
        size={size}
        color={disagreement ? 'warning' : 'info'}
        variant={disagreement ? 'filled' : 'outlined'}
        label={disagreement ? '待复核' : '待确认'}
      />
    );
  }
  return <Chip size={size} variant="outlined" color="default" label="初判" />;
}

export default ReviewStatusChip;
