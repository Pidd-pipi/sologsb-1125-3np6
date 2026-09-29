import { useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Chip,
  Collapse,
  Divider,
  FormControl,
  InputLabel,
  MenuItem,
  Paper,
  Select,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import FactCheckIcon from '@mui/icons-material/FactCheck';
import HistoryIcon from '@mui/icons-material/History';
import type { AnalysisRecord } from '../../types/analysis';
import { ANALYSIS_METHOD_LABELS } from '../../types/analysis';
import {
  CATEGORY_LABELS,
  CHEMICAL_GROUP_LABELS,
  CHEMICAL_GROUPS,
  SAMPLE_CATEGORIES,
  type ChemicalGroup,
  type SampleCategory,
} from '../../types/sample';
import type { MeteoriteSample } from '../../types/sample';
import { getAnalysisEvaluation, type SampleClassification } from '../../utils/classify';
import { formatDate } from '../../utils/format';
import { useSampleStore } from '../../stores/sampleStore';
import { useToastStore } from '../../stores/uiStore';
import ClassificationBadge from './Badge';
import ReviewStatusChip from './ReviewStatusChip';

interface ClassificationReviewPanelProps {
  sample: MeteoriteSample;
  /** 该样本的全部检测记录（store 默认按 createdAt 倒序） */
  records: AnalysisRecord[];
  classification: SampleClassification;
}

const CONFIDENCE_LABEL = { high: '置信度高', medium: '置信度中', low: '置信度低' } as const;
const CONFIDENCE_COLOR = { high: 'success', medium: 'warning', low: 'default' } as const;

/** 样本详情页的分类核定面板：汇总检测依据、处理分歧、记录策展核定与历史 */
export function ClassificationReviewPanel({
  sample,
  records,
  classification,
}: ClassificationReviewPanelProps) {
  const confirmClassification = useSampleStore((s) => s.confirmClassification);
  const notify = useToastStore((s) => s.notify);

  // 按检测时间从早到晚展示依据
  const ordered = [...records].sort(
    (a, b) => a.testedAt.localeCompare(b.testedAt) || a.createdAt - b.createdAt,
  );
  const topAdvice = [...classification.advice].sort((a, b) => b.count - a.count)[0];

  const [formOpen, setFormOpen] = useState(classification.status === 'pending');
  const [category, setCategory] = useState<SampleCategory>(
    topAdvice?.category ?? sample.category,
  );
  const [chemicalGroup, setChemicalGroup] = useState<ChemicalGroup>(sample.chemicalGroup);
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);

  const active = classification.activeDecision;
  const history = [...(sample.classificationDecisions ?? [])].reverse();

  const submit = async () => {
    if (!records.length) {
      setError('该样本还没有检测记录，请先录入检测再核定分类。');
      return;
    }
    if (!reason.trim()) {
      setError('请填写核定理由，说明采信或驳回各条检测依据的原因。');
      return;
    }
    setError(null);
    await confirmClassification(sample.id, {
      category,
      chemicalGroup,
      reason: reason.trim(),
    });
    setReason('');
    setFormOpen(false);
    notify(`已确认 ${sample.sampleNo} 的最终分类为「${CATEGORY_LABELS[category]}」`);
  };

  return (
    <Paper variant="outlined" sx={{ p: 2.5 }}>
      <Stack spacing={2}>
        <Stack direction="row" justifyContent="space-between" alignItems="center" flexWrap="wrap" gap={1}>
          <Typography variant="h6">分类核定</Typography>
          <ReviewStatusChip
            status={classification.status}
            disagreement={classification.disagreement}
            size="medium"
          />
        </Stack>

        {classification.status === 'unanalyzed' ? (
          <Alert severity="info">
            该样本尚无检测记录，当前展示的是登记时的初判分类「{CATEGORY_LABELS[sample.category]}
            」。录入检测后，样本会进入待复核流程，由策展人核定后才在详情、总览与筛选中采用。
          </Alert>
        ) : null}

        {classification.status === 'pending' ? (
          <Alert severity={classification.disagreement ? 'warning' : 'info'}>
            {classification.disagreement
              ? '检测记录之间的分类建议不一致，样本已标记为待复核，暂不采用任何分类。请逐条核对依据后由策展人选定最终分类。'
              : '各条检测建议一致，等待策展人核对依据并确认最终分类；确认前详情、总览与筛选不采用该建议。'}
          </Alert>
        ) : null}

        {!formOpen && !active ? (
          records.length > 0 ? (
            <Button
              variant="contained"
              startIcon={<FactCheckIcon />}
              sx={{ alignSelf: 'flex-start' }}
              onClick={() => {
                setCategory(topAdvice?.category ?? sample.category);
                setChemicalGroup(sample.chemicalGroup);
                setError(null);
                setFormOpen(true);
              }}
            >
              核定最终分类
            </Button>
          ) : (
            <Typography variant="caption" color="text.secondary">
              提示：至少录入一条检测记录后才能进行分类核定。
            </Typography>
          )
        ) : null}

        {active ? (
          <Box sx={{ border: '1px solid', borderColor: 'success.light', borderRadius: 2, p: 1.75, bgcolor: 'rgba(46,125,50,0.05)' }}>
            <Stack spacing={1}>
              <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" useFlexGap>
                <FactCheckIcon color="success" fontSize="small" />
                <Typography variant="subtitle2">生效核定（{formatDate(active.decidedAt)}）</Typography>
                <ClassificationBadge category={active.category} group={active.chemicalGroup} />
              </Stack>
              <Typography variant="body2">理由：{active.reason}</Typography>
              <Typography variant="caption" color="text.secondary">
                依据 {active.basedOnAnalysisIds.length} 条检测记录核定
                {active.prevDecisionId ? '，此前已有旧判断（见下方历史）' : ''}
              </Typography>
              {!formOpen ? (
                <Button
                  size="small"
                  variant="outlined"
                  sx={{ alignSelf: 'flex-start' }}
                  onClick={() => {
                    setCategory(active.category);
                    setChemicalGroup(active.chemicalGroup);
                    setFormOpen(true);
                  }}
                >
                  重新核定分类
                </Button>
              ) : null}
            </Stack>
          </Box>
        ) : null}

        {/* 各条检测依据：每条保留自己的分类建议与阈值命中 */}
        <Box>
          <Typography variant="subtitle2" sx={{ mb: 1 }}>
            检测依据汇总（{ordered.length}）
          </Typography>
          <Stack spacing={1.25}>
            {ordered.map((a) => {
              const ev = getAnalysisEvaluation(a);
              const inRangeCount = ev.thresholdHits.filter((h) => h.inRange).length;
              const conflicting = active ? ev.advice.category !== active.category : false;
              return (
                <Box
                  key={a.id}
                  sx={{
                    border: '1px solid',
                    borderColor: conflicting ? 'warning.light' : 'divider',
                    borderRadius: 2,
                    p: 1.5,
                    bgcolor: conflicting ? 'rgba(237,108,2,0.05)' : 'transparent',
                  }}
                >
                  <Stack direction="row" justifyContent="space-between" flexWrap="wrap" gap={1}>
                    <Typography variant="subtitle2">
                      {ANALYSIS_METHOD_LABELS[a.method]} · {formatDate(a.testedAt)}
                      {a.sectionId ? ' · 对切片检测' : ''}
                    </Typography>
                    <Stack direction="row" spacing={0.75} alignItems="center">
                      <Chip
                        size="small"
                        color={CONFIDENCE_COLOR[ev.advice.confidence]}
                        label={CONFIDENCE_LABEL[ev.advice.confidence]}
                      />
                      <ClassificationBadge category={ev.advice.category} showGroup={false} />
                      {conflicting ? <Chip size="small" color="warning" label="与生效核定不一致" /> : null}
                    </Stack>
                  </Stack>
                  <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
                    Fa {a.fa} mol% · Fs {a.fs} mol% · Ni {a.ni} wt% · 带宽 {a.kamaciteBandwidth} mm
                  </Typography>
                  <Typography variant="body2" sx={{ mt: 0.5 }}>
                    {ev.advice.summary}
                  </Typography>
                  <Typography variant="caption" color="text.secondary">
                    阈值命中 {inRangeCount}/{ev.thresholdHits.length} 项在常规区间：
                    {ev.thresholdHits
                      .map((h) => `${h.label} ${h.value}${h.unit}（${h.inRange ? '在区间' : '超出'}）`)
                      .join('；')}
                  </Typography>
                  <Typography variant="caption" color="text.secondary" component="div">
                    命中说明：{ev.advice.hits.join('；')}
                  </Typography>
                </Box>
              );
            })}
            {ordered.length === 0 ? (
              <Alert severity="info">暂无检测依据，可在下方「分析检测记录」处录入。</Alert>
            ) : null}
          </Stack>
        </Box>

        <Collapse in={formOpen}>
          <Box sx={{ borderTop: '1px dashed', borderColor: 'divider', pt: 2 }}>
            <Stack spacing={1.5}>
              <Typography variant="subtitle2">
                {active ? '重新核定' : '策展人核定最终分类'}
              </Typography>
              {error ? <Alert severity="error">{error}</Alert> : null}
              <Stack direction="row" spacing={1.5} flexWrap="wrap" useFlexGap>
                <FormControl size="small" sx={{ minWidth: 180 }}>
                  <InputLabel id="curator-category-label">最终分类</InputLabel>
                  <Select
                    labelId="curator-category-label"
                    label="最终分类"
                    value={category}
                    onChange={(e) => setCategory(e.target.value as SampleCategory)}
                  >
                    {SAMPLE_CATEGORIES.map((c) => (
                      <MenuItem key={c} value={c}>
                        {CATEGORY_LABELS[c]}
                      </MenuItem>
                    ))}
                  </Select>
                </FormControl>
                <FormControl size="small" sx={{ minWidth: 180 }}>
                  <InputLabel id="curator-group-label">化学群</InputLabel>
                  <Select
                    labelId="curator-group-label"
                    label="化学群"
                    value={chemicalGroup}
                    onChange={(e) => setChemicalGroup(e.target.value as ChemicalGroup)}
                  >
                    {CHEMICAL_GROUPS.map((g) => (
                      <MenuItem key={g} value={g}>
                        {CHEMICAL_GROUP_LABELS[g]}
                      </MenuItem>
                    ))}
                  </Select>
                </FormControl>
                {topAdvice ? (
                  <Button
                    size="small"
                    variant="text"
                    onClick={() => setCategory(topAdvice.category)}
                  >
                    采用多数建议（{CATEGORY_LABELS[topAdvice.category]} ×{topAdvice.count}）
                  </Button>
                ) : null}
              </Stack>
              <TextField
                id="curator-reason"
                size="small"
                label="核定理由（必填）"
                placeholder="说明采信/驳回各条检测依据的原因，例如以探针复测值为准、带宽测量受风化影响等"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                multiline
                minRows={2}
                fullWidth
              />
              <Stack direction="row" spacing={1.5}>
                <Button variant="contained" startIcon={<FactCheckIcon />} onClick={submit} id="confirm-classification">
                  {active ? '保存重新核定' : '确认最终分类'}
                </Button>
                {active ? (
                  <Button variant="text" onClick={() => setFormOpen(false)}>
                    取消
                  </Button>
                ) : null}
              </Stack>
            </Stack>
          </Box>
        </Collapse>

        {history.length ? (
          <>
            <Divider />
            <Box>
              <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 1 }}>
                <HistoryIcon fontSize="small" color="action" />
                <Typography variant="subtitle2">核定历史（旧判断与选择依据继续可查）</Typography>
              </Stack>
              <Stack spacing={1.25}>
                {history.map((d) => {
                  const triggerRecord = d.supersedeAnalysisId
                    ? records.find((a) => a.id === d.supersedeAnalysisId)
                    : undefined;
                  return (
                    <Box
                      key={d.id}
                      sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 2, p: 1.5 }}
                    >
                      <Stack direction="row" justifyContent="space-between" flexWrap="wrap" gap={1}>
                        <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" useFlexGap>
                          <Typography variant="body2" fontWeight={600}>
                            {formatDate(d.decidedAt)} 核定
                          </Typography>
                          <ClassificationBadge category={d.category} group={d.chemicalGroup} />
                        </Stack>
                        <Chip
                          size="small"
                          color={d.status === 'active' ? 'success' : 'default'}
                          label={d.status === 'active' ? '生效中' : '已失效'}
                        />
                      </Stack>
                      <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
                        理由：{d.reason}
                      </Typography>
                      <Typography variant="caption" color="text.secondary" component="div">
                        依据 {d.basedOnAnalysisIds.length} 条检测记录
                        {d.status === 'superseded'
                          ? d.supersedeReason === 'new-analysis'
                            ? `；${
                                triggerRecord
                                  ? `${formatDate(triggerRecord.testedAt)}的${ANALYSIS_METHOD_LABELS[triggerRecord.method]}检测`
                                  : '新增检测'
                              }建议为「${
                                triggerRecord
                                  ? CATEGORY_LABELS[getAnalysisEvaluation(triggerRecord).advice.category]
                                  : '其他分类'
                              }」，原结论不再成立，于 ${formatDate(d.supersededAt ?? d.decidedAt)} 自动转入待复核`
                            : `；策展人于 ${formatDate(d.supersededAt ?? d.decidedAt)} 重新核定，本判断归档`
                          : ''}
                      </Typography>
                    </Box>
                  );
                })}
              </Stack>
            </Box>
          </>
        ) : null}
      </Stack>
    </Paper>
  );
}

export default ClassificationReviewPanel;
