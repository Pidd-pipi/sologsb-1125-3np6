import './ui-env';
import React from 'react';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { db, seedIfEmpty } from '../src/db';
import { useSampleStore } from '../src/stores/sampleStore';
import Overview from '../src/pages/Overview';
import Detail from '../src/pages/Detail';

let failures = 0;
function assert(cond: unknown, msg: string) {
  if (!cond) {
    failures++;
    console.error('FAIL:', msg);
  } else console.log('ok:', msg);
}

async function main() {
  await seedIfEmpty();
  await act(async () => {
    await useSampleStore.getState().loadAll();
  });

  // 1. 总览渲染：4 份样本、待复核文案与快捷筛选
  let utils = render(
    <MemoryRouter>
      <Overview />
    </MemoryRouter>,
  );
  await waitFor(() => assert(screen.getByText(/其中 2 份分类待复核/) !== null, '总览渲染待复核统计'));
  assert(screen.getAllByText('分类待复核').length === 2, '总览 2 个虚线待复核徽标');
  assert(screen.getByText('MET-2024-001') !== null, '总览渲染已确认样本');

  await act(async () => {
    fireEvent.click(screen.getByText(/只看待复核/));
  });
  await waitFor(() => {
    const nos = ['MET-2024-001', 'MET-2024-002', 'MET-2024-003', 'MET-2024-004'].map((no) =>
      screen.queryByText(no),
    );
    assert(
      !nos[0] && !nos[1] && nos[2] && nos[3],
      '只看待复核仅显示 MET-2024-003 / 004',
    );
  });
  await act(async () => {
    fireEvent.click(screen.getByText(/只看待复核/));
  });
  cleanup();

  // 2. 样本4（检测分歧、旧裁决已被推翻、待复核）详情与复核面板
  utils = render(
    <MemoryRouter initialEntries={['/samples/sample_seed_4']}>
      <Routes>
        <Route path="/samples/:id" element={<Detail />} />
      </Routes>
    </MemoryRouter>,
  );
  await waitFor(() => assert(screen.getByText('分类复核与策展人裁决') !== null, '详情渲染复核面板'));
  assert(screen.getByText('历史裁决（1）') !== null, '渲染被推翻的历史裁决');
  assert(screen.getByText(/首次电子探针/) !== null, '旧裁决理由可查');
  assert(screen.getByText('确认最终分类') !== null, '渲染策展人确认按钮');
  assert(screen.getByText(/登记初判/) !== null, '待复核样本显示登记初判');
  assert(
    document.body.textContent?.includes('石铁陨石 / 球粒陨石') ||
      document.body.textContent?.includes('球粒陨石 / 石铁陨石'),
    '两条分歧建议都列出（待复核原因）',
  );
  assert(screen.getAllByText(/阈值命中/).length >= 2, '每条检测各有阈值命中入口');

  // 展开第一条检测的阈值命中（每条记录保留自己的阈值命中）
  await act(async () => {
    fireEvent.click(screen.getAllByText(/阈值命中/)[0]);
  });
  assert(screen.getAllByText(/超阈值|阈值内/).length > 0, '展开显示该条记录阈值明细');
  cleanup();

  // 3. 给无检测的样本3补一条检测（无分歧），再在详情页走策展人确认流程
  await act(async () => {
    await useSampleStore.getState().addAnalysis({
      sampleId: 'sample_seed_3',
      target: 'sample',
      method: 'microprobe',
      fa: 6,
      fs: 8,
      ni: 0.4,
      kamaciteBandwidth: 0.02,
      testedAt: '2026-09-28',
    });
  });
  utils = render(
    <MemoryRouter initialEntries={['/samples/sample_seed_3']}>
      <Routes>
        <Route path="/samples/:id" element={<Detail />} />
      </Routes>
    </MemoryRouter>,
  );
  await waitFor(() => assert(screen.getByText(/检测意见汇总（1）/) !== null, '详情面板汇总 1 条检测'));

  // 理由为空时提交被拦截
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name: '确认最终分类' }));
  });
  assert(screen.getByText(/请填写采信理由/) !== null, '未填理由时阻止确认');

  // 填写理由后确认生效
  await act(async () => {
    fireEvent.change(screen.getByLabelText('采信理由（必填）'), {
      target: { value: 'Fa 偏低且非平衡特征，支持无球粒陨石，证据一致，采信。' },
    });
  });
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name: '确认最终分类' }));
    await new Promise((resolve) => setTimeout(resolve, 50));
  });
  await waitFor(
    () => {
      if (!document.body.textContent?.includes('当前生效分类为')) throw new Error('等待生效裁决');
    },
    { timeout: 1500 },
  );
  assert(document.body.textContent?.includes('当前生效分类为'), '确认后详情展示生效裁决');
  assert(
    document.body.textContent?.includes('重新裁决（旧裁决将归档保留）'),
    '确认后出现重新裁决入口',
  );
  const s3 = useSampleStore.getState().samples.find((x) => x.id === 'sample_seed_3')!;
  assert(s3.classificationStatus === 'confirmed' && s3.classificationDecision !== null, 'store 中样本已确认');
  cleanup();

  db.close();
  if (failures) {
    console.error(`\n${failures} 项失败`);
    process.exit(1);
  }
  console.log('\nUI 渲染冒烟全部通过');
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
