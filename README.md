# 陨石样本编目台（sologsb-1125 / gbmeteorite）

## Docker 一键启动

```bash
cp .env.example .env
docker compose up -d --build
```

启动后访问：<http://localhost:21825>

停止（镜像保留）：

```bash
docker compose down
```

## 项目简介

面向陨石收藏者与标本室的纯前端单页应用：把样本、发现记录、切片制样与检测数值整理成本地可检索档案。
核心动作是登记样本与发现地坐标、挂接切片、录入电子探针数值并给出分类建议。
**分类采用「检测汇总 → 分歧待复核 → 策展核定」闭环**：每条检测保留自己的分类建议与阈值命中，
建议出现分歧时样本进入待复核，策展人核对依据、选定最终分类并填写理由后，详情、总览与筛选才采用该结果；
此后新增检测若建议与已确认分类冲突，样本自动重新进入待复核，旧判断与选择依据完整留档。

- 纯前端 SPA：**无后端、无数据库服务、无外部 API**
- 所有数据保存在浏览器本地：业务数据走 **IndexedDB（Dexie，库名 `gbmeteorite-db`）**，表单草稿走 **localStorage**
- 容器无状态，不挂载任何命名卷；换浏览器即换档案库

## 技术栈

| 层次 | 选型 |
| --- | --- |
| 框架 | React 18 + TypeScript 5.7 |
| 构建 | Vite 6（`build` 脚本为 `tsc -b && vite build`，类型检查零错误） |
| UI 组件库 | MUI（@mui/material 6 + @mui/icons-material） |
| 状态管理 | Zustand（`sampleStore` 业务数据 / `uiStore` 筛选与提示） |
| 路由 | React Router 6（BrowserRouter + nginx `try_files` 兜底） |
| 本地存储 | Dexie 4（IndexedDB）+ localStorage（草稿） |
| 部署 | 多阶段 Dockerfile：node:20-alpine 构建 → nginx:alpine 托管 |

## 核心页面

| 路由 | 说明 | 消费模型 |
| --- | --- | --- |
| `/` | 样本总览：卡片流 + 复核状态/分类/化学群/重量区间筛选与排序，缺坐标或缺切片显示角标，待复核样本展示各建议票数且不计入具体分类 | MeteoriteSample |
| `/samples/new` | 样本登记：编号生成、初判分类化学群、重量、存放位置，可补录发现地坐标并即时校验 | MeteoriteSample、FindRecord |
| `/samples/:id` | 样本详情：基本信息 + **分类核定面板（检测依据汇总、分歧提示、策展核定与历史）** + 发现地摘要 + 切片列表 + 分析记录，可就地新增 | 四个模型 |
| `/sections` | 切片库：按厚度与矿物占比筛选，回跳样本，批量标注质量 | ThinSection、MeteoriteSample |
| `/analysis` | 分析检测：录入 Fa / Fs / Ni / 铁纹石带宽，实时分类建议与阈值命中说明；写入时固化建议快照 | AnalysisRecord、MeteoriteSample |
| `/locations` | 发现地分布：SVG 网格按经纬度打点、按**有效分类**着色（待复核为灰色）、点选弹出样本清单 | FindRecord、MeteoriteSample |

## 数据模型（`src/types/` 独立文件）

- `types/sample.ts` — **MeteoriteSample**：id、样本编号、总重量 g、登记初判分类/化学群、风化等级 W0–W4、发现/坠落、存放位置、`classificationDecisions` 分类核定历史
- `types/find.ts` — **FindRecord**：id、关联样本、地名、国家地区、经纬度、坐标来源（GPS/文献）、发现环境、发现者
- `types/section.ts` — **ThinSection**：id、切片编号、关联样本、厚度 μm、制样方式、矿物占比、显微照片清单
- `types/analysis.ts` — **AnalysisRecord**：id、关联样本或切片、方法、橄榄石 Fa、辉石 Fs、Ni wt%、铁纹石带宽 mm、检测日期，以及录入时固化的 `evaluation`（分类建议 + 逐项阈值命中快照）

### 分类复核闭环

| 状态 | 条件 | 对外采用的分类 |
| --- | --- | --- |
| 初判（unanalyzed） | 尚无检测记录 | 登记时填写的初判分类 |
| 待确认 / 待复核（pending） | 有检测但无生效核定；建议一致显示「待确认」，出现分歧显示「待复核」 | 不采用任何结果（详情与总览标黄，分类筛选不命中） |
| 已确认（confirmed） | 策展人选定最终分类并填写理由 | 核定的分类与化学群 |

- 新增检测时自动固化其分类建议与阈值命中快照；新检测建议与生效核定不一致时，生效核定自动标记 `superseded`（`supersedeReason: new-analysis`），样本回到待复核
- 重新核定会把上一条 active 核定以 `supersedeReason: curator-revision` 归档并经 `prevDecisionId` 串链，旧理由与依据检测 id 始终可查（详情页「核定历史」）
- 汇总逻辑集中在 `utils/classify.ts`（`classificationOf` / `tallyAdvice` / `getAnalysisEvaluation`）与 `hooks/useClassification.ts`，全站消费同一份结论

## 目录结构

```
sologsb-1125/
├── docker-compose.yml
├── .env / .env.example
├── README.md
└── frontend/
    ├── Dockerfile          # 多阶段：node:20-alpine → nginx:alpine
    ├── nginx.conf          # try_files + gzip
    ├── index.html
    ├── package.json
    ├── tsconfig*.json
    ├── vite.config.ts
    ├── public/favicon.svg
    └── src/
        ├── types/{sample,find,section,analysis}.ts
        ├── db/index.ts                 # Dexie 封装与 v1→v4 升级迁移
        ├── stores/{sampleStore,uiStore}.ts
        ├── components/common/{SampleCard,Badge,FieldGroup,EmptyState,CoordinatePicker,AppShell,ReviewStatusChip,ClassificationReviewPanel}.tsx
        ├── hooks/{useSampleFilter,useLocalDraft,useRegionStats,useClassification}.ts
        ├── pages/{Overview,New,Detail,Sections,Analysis,Locations}.tsx
        ├── router/index.tsx
        └── utils/{classify,format,geo}.ts
```

## 数据存储说明

- **库名**：`gbmeteorite-db`；表：`samples`、`finds`、`sections`、`analysis`
- **版本迁移**：
  - v1 建 `samples` / `finds` / `sections`
  - v2 新增 `analysis` 表并加 `sampleId` 索引
  - v3 为 `samples` 补 `updatedAt` 字段并按 id 回填旧记录
  - v4 为 `analysis` 补固化评估快照 `evaluation`（升级事务里按当前规则回填旧记录）；`samples` 新增可选 `classificationDecisions`（对象库结构不变，不重建数据）
- **草稿**：`/samples/new` 与 `/analysis` 的表单草稿写入 localStorage（键前缀 `gbmeteorite:draft:`），切页自动恢复，提交后清理
- 首次打开会灌入 4 份演示样本（已确认 / 已确认 / 仅初判 / 检测分歧且旧核定被新检测推翻、正在待复核）、2 条发现记录、2 张切片与 5 条检测记录，便于直接体验筛选与打点

## 环境变量

| 变量 | 默认值 | 说明 |
| --- | --- | --- |
| `COMPOSE_PROJECT_NAME` | `gbmeteorite` | Compose 项目名与容器名前缀 |
| `FRONTEND_PORT` | `21825` | 宿主端口，映射到容器 80 |
