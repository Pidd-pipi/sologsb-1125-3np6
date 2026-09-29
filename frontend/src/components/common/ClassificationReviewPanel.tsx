import { useMemo, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Checkbox,
  Chip,
  Collapse,
  Divider,
  FormControl,
  FormControlLabel,
  InputLabel,
  List,
  ListItem,
  ListItemText,
  MenuItem,
  Paper,
  Select,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import FactCheckIcon from '@mui/icons-material/FactCheck';
import HistoryIcon from '@mui/icons-material/History';
import KeyboardArrowDownIcon from '@mui/icons-material/KeyboardArrowDown';
import KeyboardArrowUpIcon from '@mui/icons-material/KeyboardArrowUp';
import { useSampleStore } from '../../stores/sampleStore';
import { useToastStore } from '../../stores/uiStore';
import {
  CATEGORY_DEFAULT_GROUP,
  CATEGORY_LABELS,
  CHEMICAL_GROUP_LABELS,
  CHEMICAL_GROUPS,
  SAMPLE_CATEGORIES,
  type ChemicalGroup,
  type MeteoriteSample,
  type SampleCategory,
  type SupersededDecision,
} from '../../types/sample';
import { ANALYSIS_METHOD_LABELS } from '../../types/analysis';
import { categoryColor, formatDate } from '../../utils/format';
import { getAnalysisEvaluation, summarizeReview } from '../../utils/review';
import ClassificationBadge from './Badge';

interface Props {
  sample: MeteoriteSample;
}

const CONFIDENCE_LABELS = { high: '高', medium: '中', low: '低' } as const;
const CONFIDENCE_COLOR = { high: 'success', medium: 'warning', low: 'default' } as const;

const SUPERSEDED_LABELS: Record<SupersededDecision['supersededReason'], string> = {
  'new-conflict': '新检测意见与裁决不一致，自动转入待复核',
  're-decided': '策展人重新裁决',
};

/** 单条检测的阈值命中（来自保存时固化的快照） */
function ThresholdHits({ entry }: { entry: ReturnType<typeof getAnalysisEvaluation> }) {
  return (
    <Stack spacing={0.75} sx={{ mt: 0.75 }}>
      {entry.hits.map((h) => (
        <Box
          key={h.key}
          sx={{
            px: 1,
            py: 0.5,
            borderRadius: 1,
            border: '1px solid',
            borderColor: h.inRange ? 'divider' : 'warning.main',
            bgcolor: h.inRange ? 'transparent' : 'rgba(237,108,2,0.06)',
          }}
        >
          <Stack direction="row" justifyContent="space-between" alignItems="center">
            <Typography variant="caption" fontWeight={600}>
              {h.label}
            </Typography>
            <Chip
              size="small"
              color={h.inRange ? 'success' : 'warning'}
              label={`${h.value} ${h.unit} · ${h.inRange ? '阈值内' : '超阈值'}`}
              sx={{ height: 20, '& .MuiChip-label': { px: 0.75, fontSize: 11 } }}
            />
          </Stack>
          <Typography variant="caption" color="text.secondary" display="block">
            {h.description}
          </Typography>
        </Box>
      ))}
    </Stack>
  );
}

/**
 * 分类复核面板：
 * 1) 汇总同样本各条检测意见（每条保留自己的阈值命中），分歧时给出提示；
 * 2) 策展人核对依据后选定最终分类与化学群、填写采信理由；
 * 3) 裁决确认后才被详情/总览/筛选采信；旧裁决归档可查。
 */
export default function ClassificationReviewPanel({ sample }: Props) {
  const allAnalysis = useSampleStore((s) => s.analysis);
  const confirmClassification = useSampleStore((s) => s.confirmClassification);
  const notify = useToastStore((s) => s.notify);

  const myAnalysis = useMemo(
    () => allAnalysis.filter((a) => a.sampleId === sample.id),
    [allAnalysis, sample.id],
  );
  const summary = useMemo(() => summarizeReview(sample, myAnalysis), [sample, myAnalysis]);

  const initialCategory =
    sample.classificationDecision?.category ??
    summary.consensusCategory ??
    sample.category;
  const [category, setCategory] = useState<SampleCategory>(initialCategory);
  const [chemicalGroup, setChemicalGroup] = useState<ChemicalGroup>(
    sample.classificationDecision?.chemicalGroup ?? CATEGORY_DEFAULT_GROUP[initialCategory],
  );
  const [curator, setCurator] = useState(sample.classificationDecision?.curator ?? '');
  const [reason, setReason] = useState(sample.classificationDecision?.reason ?? '');
  const [evidenceIds, setEvidenceIds] = useState<string[]>(
    sample.classificationDecision?.evidenceAnalysisIds ?? myAnalysis.map((a) => a.id),
  );
  const [expanded, setExpanded] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const changeCategory = (next: SampleCategory) => {
    setCategory(next);
    setChemicalGroup(CATEGORY_DEFAULT_GROUP[next]);
  };

  const toggleEvidence = (id: string) => {
    setEvidenceIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  };

  const submit = async () => {
    if (!reason.trim()) {
      setError('请填写采信理由，说明各条检测依据如何支持该分类。');
      return;
    }
    setError(null);
    await confirmClassification(sample.id, {
      category,
      chemicalGroup,
      reason: reason.trim(),
      curator: curator.trim() || undefined,
      evidenceAnalysisIds: evidenceIds,
    });
    notify('最终分类已确认，详情、总览与筛选随即采用该结果', 'success');
  };

  const decision = sample.classificationDecision ?? null;
  const evidenceRecords = myAnalysis.filter((a) => decision?.evidenceAnalysisIds.includes(a.id));
  const history = sample.decisionHistory ?? [];

  return (
    <Paper variant="outlined" sx={{ p: 2.5 }}>
      <Stack spacing={2}>
        <Stack direction="row" spacing={1} alignItems="center">
          <FactCheckIcon color="action" fontSize="small" />
          <Typography variant="h6">分类复核与策展人裁决</Typography>
          {summary.status === 'confirmed' ? (
            <Chip size="small" color="success" label="已确认" />
          ) : (
            <Chip size="small" color="warning" label="待复核" />
          )}
        </Stack>

        {summary.status === 'confirmed' && decision ? (
          <Alert severity="success">
            当前生效分类为
            <Box component="span" sx={{ mx: 0.5, fontWeight: 700 }}>
              {CATEGORY_LABELS[decision.category]} · {CHEMICAL_GROUP_LABELS[decision.chemicalGroup]}
            </Box>
            ，由{decision.curator ? `「${decision.curator}」` : '策展人'}于 {formatDate(decision.decidedAt)} 采信。
          </Alert>
        ) : (
          <Alert severity="warning">{summary.pendingReason}</Alert>
        )}

        {/* 各条检测依据：意见 + 各自阈值命中 */}
        <Box>
          <Typography variant="subtitle2" sx={{ mb: 1 }}>
            检测意见汇总（{summary.entries.length}）
            {summary.hasConflict ? (
              <Chip
                size="small"
                color="error"
                variant="outlined"
                label="意见分歧"
                sx={{ ml: 1 }}
              />
            ) : summary.entries.length ? (
              <Chip size="small" color="success" variant="outlined" label="意见一致" sx={{ ml: 1 }} />
            ) : null}
          </Typography>
          {summary.entries.length === 0 ? (
            <Alert severity="info">暂无检测记录，分类缺少检测依据；可在上方录入检测后再裁决。</Alert>
          ) : (
            <Stack spacing={1}>
              {summary.entries.map(({ record, evaluation }) => {
                const contradicts =
                  decision !== null && evaluation.advice.category !== decision.category;
                const open = expanded === record.id;
                return (
                  <Box
                    key={record.id}
                    sx={{
                      border: '1px solid',
                      borderColor: contradicts ? 'error.main' : 'divider',
                      borderLeft: '4px solid',
                      borderLeftColor: contradicts ? 'error.main' : categoryColor(evaluation.advice.category),
                      borderRadius: 1.5,
                      p: 1.25,
                    }}
                  >
                    <Stack direction="row" justifyContent="space-between" flexWrap="wrap" gap={1}>
                      <Box>
                        <Typography variant="subtitle2">
                          {ANALYSIS_METHOD_LABELS[record.method]} · {formatDate(record.testedAt)}
                          {contradicts ? (
                            <Chip
                              size="small"
                              color="error"
                              label="与生效裁决不一致"
                              sx={{ ml: 1, height: 20 }}
                            />
                          ) : null}
                        </Typography>
                        <Typography variant="caption" color="text.secondary">
                          Fa {record.fa} mol% · Fs {record.fs} mol% · Ni {record.ni} wt% · 带宽{' '}
                          {record.kamaciteBandwidth} mm
                        </Typography>
                      </Box>
                      <Stack direction="row" spacing={0.75} alignItems="center" flexWrap="wrap" useFlexGap>
                        <ClassificationBadge category={evaluation.advice.category} showGroup={false} />
                        <Chip
                          size="small"
                          color={CONFIDENCE_COLOR[evaluation.advice.confidence]}
                          label={`置信度 ${CONFIDENCE_LABELS[evaluation.advice.confidence]}`}
                        />
                        <Button
                          size="small"
                          onClick={() => setExpanded(open ? null : record.id)}
                          endIcon={open ? <KeyboardArrowUpIcon /> : <KeyboardArrowDownIcon />}
                        >
                          阈值命中 {evaluation.hits.filter((h) => h.inRange).length}/{evaluation.hits.length}
                        </Button>
                      </Stack>
                    </Stack>
                    <Typography variant="body2" sx={{ mt: 0.5 }}>
                      {evaluation.advice.summary}
                    </Typography>
                    <List dense disablePadding>
                      {evaluation.advice.hits.map((h) => (
                        <ListItem key={h} disableGutters sx={{ py: 0 }}>
                          <ListItemText primary={h} primaryTypographyProps={{ variant: 'caption' }} />
                        </ListItem>
                      ))}
                    </List>
                    <Collapse in={open} unmountOnExit>
                      <ThresholdHits entry={evaluation} />
                    </Collapse>
                  </Box>
                );
              })}
            </Stack>
          )}
        </Box>

        <Divider />

        {/* 策展人裁决表单 */}
        <Box>
          <Typography variant="subtitle2" sx={{ mb: 1 }}>
            {decision ? '重新裁决（旧裁决将归档保留）' : '策展人选定最终分类'}
          </Typography>
          <Stack spacing={1.5}>
            <Stack direction="row" spacing={1.5} flexWrap="wrap" useFlexGap>
              <FormControl size="small" sx={{ minWidth: 180 }}>
                <InputLabel id="review-category-label">最终分类</InputLabel>
                <Select
                  labelId="review-category-label"
                  label="最终分类"
                  value={category}
                  onChange={(e) => changeCategory(e.target.value as SampleCategory)}
                >
                  {SAMPLE_CATEGORIES.map((c) => (
                    <MenuItem key={c} value={c}>
                      {CATEGORY_LABELS[c]}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
              <FormControl size="small" sx={{ minWidth: 180 }}>
                <InputLabel id="review-group-label">化学群</InputLabel>
                <Select
                  labelId="review-group-label"
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
              <TextField
                size="small"
                label="策展人署名（可选）"
                value={curator}
                onChange={(e) => setCurator(e.target.value)}
                sx={{ width: 200 }}
              />
            </Stack>
            <TextField
              size="small"
              label="采信理由（必填）"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="说明哪些检测依据支持该分类、如何处理分歧项"
              multiline
              minRows={2}
            />
            {myAnalysis.length ? (
              <Box>
                <Typography variant="caption" color="text.secondary">
                  引用依据（勾选本次裁决参考的检测记录）：
                </Typography>
                <Stack direction="row" spacing={0.5} flexWrap="wrap" useFlexGap>
                  {myAnalysis.map((a) => (
                    <FormControlLabel
                      key={a.id}
                      control={
                        <Checkbox
                          size="small"
                          checked={evidenceIds.includes(a.id)}
                          onChange={() => toggleEvidence(a.id)}
                        />
                      }
                      label={`${ANALYSIS_METHOD_LABELS[a.method]} · ${formatDate(a.testedAt)}`}
                      componentsProps={{ typography: { variant: 'caption' } }}
                    />
                  ))}
                </Stack>
              </Box>
            ) : null}
            {error ? <Alert severity="error">{error}</Alert> : null}
            <Button
              variant="contained"
              color="primary"
              onClick={submit}
              sx={{ alignSelf: 'flex-start' }}
              id="confirm-classification"
            >
              {decision ? '提交重新裁决' : '确认最终分类'}
            </Button>
          </Stack>
        </Box>

        {/* 当前裁决依据 */}
        {decision ? (
          <>
            <Divider />
            <Box>
              <Typography variant="subtitle2" sx={{ mb: 0.5 }}>
                当前裁决理由
              </Typography>
              <Typography variant="body2">{decision.reason}</Typography>
              {evidenceRecords.length ? (
                <Typography variant="caption" color="text.secondary" display="block" sx={{ mt: 0.5 }}>
                  采信检测：
                  {evidenceRecords
                    .map((a) => `${ANALYSIS_METHOD_LABELS[a.method]}(${formatDate(a.testedAt)})`)
                    .join('、')}
                </Typography>
              ) : (
                <Typography variant="caption" color="text.secondary" display="block" sx={{ mt: 0.5 }}>
                  本次裁决未引用检测记录。
                </Typography>
              )}
            </Box>
          </>
        ) : null}

        {/* 历史裁决：旧判断与选择依据继续可查 */}
        {history.length ? (
          <>
            <Divider />
            <Box>
              <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 1 }}>
                <HistoryIcon fontSize="small" color="action" />
                <Typography variant="subtitle2">历史裁决（{history.length}）</Typography>
              </Stack>
              <Stack spacing={1}>
                {history.map((h, idx) => (
                  <Box
                    key={`${h.decidedAt}-${idx}`}
                    sx={{ border: '1px dashed', borderColor: 'divider', borderRadius: 1.5, p: 1.25 }}
                  >
                    <Stack direction="row" justifyContent="space-between" flexWrap="wrap" gap={0.5}>
                      <ClassificationBadge category={h.category} group={h.chemicalGroup} />
                      <Chip
                        size="small"
                        color="warning"
                        variant="outlined"
                        label={`${SUPERSEDED_LABELS[h.supersededReason]} · ${formatDate(h.supersededAt)}`}
                      />
                    </Stack>
                    <Typography variant="body2" sx={{ mt: 0.5 }}>
                      {h.reason}
                    </Typography>
                    <Typography variant="caption" color="text.secondary" display="block">
                      {h.curator ? `策展人：${h.curator} · ` : ''}
                      裁决于 {formatDate(h.decidedAt)}
                    </Typography>
                  </Box>
                ))}
              </Stack>
            </Box>
          </>
        ) : null}
      </Stack>
    </Paper>
  );
}
