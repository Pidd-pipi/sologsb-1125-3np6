import { Box, Card, CardActionArea, CardContent, Chip, Stack, Typography } from '@mui/material';
import { Link as RouterLink } from 'react-router-dom';
import {
  CATEGORY_LABELS,
  FALL_OR_FIND_LABELS,
  WEATHERING_LABELS,
  type MeteoriteSample,
} from '../../types/sample';
import type { FindRecord } from '../../types/find';
import { formatWeight, categoryColor } from '../../utils/format';
import { formatCoordinate } from '../../utils/geo';
import { ClassificationBadge } from './Badge';
import { ReviewStatusChip } from './ReviewStatusChip';
import type { SampleClassification } from '../../utils/classify';

interface SampleCardProps {
  sample: MeteoriteSample;
  /** 由 useClassificationMap 汇总出的分类复核结论；缺省时退回登记初判 */
  classification?: SampleClassification;
  find?: FindRecord;
  sectionCount?: number;
  analysisCount?: number;
  to?: string;
}

/** 样本摘要卡片：被 / 与 /samples/:id 消费 */
export function SampleCard({
  sample,
  classification,
  find,
  sectionCount = 0,
  analysisCount = 0,
  to,
}: SampleCardProps) {
  const missing: string[] = [];
  if (!find) missing.push('缺坐标');
  if (sectionCount === 0) missing.push('缺切片');

  const status = classification?.status ?? 'unanalyzed';
  const isPending = status === 'pending';
  const effectiveCategory = classification?.effectiveCategory ?? sample.category;
  const effectiveGroup = classification?.effectiveGroup ?? sample.chemicalGroup;

  return (
    <Card
      variant="outlined"
      sx={{
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        borderRadius: 2.5,
        transition: 'box-shadow .2s ease, transform .2s ease',
        '&:hover': { boxShadow: 4, transform: 'translateY(-2px)' },
      }}
    >
      <CardActionArea
        component={RouterLink}
        to={to ?? `/samples/${sample.id}`}
        sx={{ flex: 1, alignItems: 'stretch' }}
      >
        <CardContent sx={{ display: 'flex', flexDirection: 'column', gap: 1.25, height: '100%' }}>
          <Stack direction="row" justifyContent="space-between" alignItems="flex-start" spacing={1}>
            <Box>
              <Typography variant="overline" color="text.secondary" lineHeight={1.2}>
                样本编号
              </Typography>
              <Typography variant="h6" fontWeight={700} letterSpacing="0.02em">
                {sample.sampleNo}
              </Typography>
            </Box>
            <Typography variant="h6" fontWeight={700} color="primary.main" whiteSpace="nowrap">
              {formatWeight(sample.totalWeight)}
            </Typography>
          </Stack>

          <Stack direction="row" spacing={0.75} alignItems="center" flexWrap="wrap" useFlexGap>
            <ClassificationBadge category={effectiveCategory} group={effectiveGroup} />
            <ReviewStatusChip status={status} disagreement={classification?.disagreement} />
          </Stack>

          {isPending ? (
            <Stack direction="row" spacing={0.5} flexWrap="wrap" useFlexGap>
              <Typography variant="caption" color="text.secondary">
                {classification?.disagreement ? '检测建议分歧：' : '检测建议：'}
              </Typography>
              {classification?.advice.map((t) => (
                <Chip
                  key={t.category}
                  size="small"
                  label={`${CATEGORY_LABELS[t.category]} ×${t.count}`}
                  sx={{
                    height: 18,
                    fontSize: 11,
                    bgcolor: `${categoryColor(t.category)}22`,
                    color: categoryColor(t.category),
                    '& .MuiChip-label': { px: 0.75 },
                  }}
                />
              ))}
            </Stack>
          ) : null}

          <Typography variant="body2" color="text.secondary">
            {FALL_OR_FIND_LABELS[sample.fallOrFind]} · {WEATHERING_LABELS[sample.weathering]}
          </Typography>

          <Typography variant="body2" color="text.secondary">
            发现地：{find ? `${find.region} · ${find.placeName}` : '未登记'}
          </Typography>

          {find ? (
            <Typography variant="caption" color="text.secondary">
              {formatCoordinate(find.longitude, find.latitude)} · 来源
              {find.coordinateSource === 'gps' ? 'GPS' : '文献'}
            </Typography>
          ) : null}

          <Stack direction="row" spacing={0.75} flexWrap="wrap" useFlexGap sx={{ mt: 'auto', pt: 1 }}>
            <Chip size="small" variant="outlined" label={`切片 ${sectionCount}`} />
            <Chip size="small" variant="outlined" label={`检测 ${analysisCount}`} />
            {missing.map((m) => (
              <Chip key={m} size="small" color="warning" label={m} />
            ))}
          </Stack>
        </CardContent>
      </CardActionArea>
    </Card>
  );
}

export default SampleCard;
