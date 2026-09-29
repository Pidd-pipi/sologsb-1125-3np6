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
| `/` | 样本总览：卡片流 + 分类/化学群/重量区间筛选与排序，缺坐标或缺切片显示角标，**待复核样本以虚线徽标标出且不参与分类/化学群筛选**，可一键「只看待复核」 | MeteoriteSample |
| `/samples/new` | 样本登记：编号生成、分类化学群（**仅为初判，样本默认待复核**）、重量、存放位置，可补录发现地坐标并即时校验 | MeteoriteSample、FindRecord |
| `/samples/:id` | 样本详情：基本信息 + 发现地摘要 + 切片列表 + 分析记录（**每条保留自己的阈值命中**）+ **分类复核与策展人裁决面板**，可就地新增 | 四个模型 |
| `/sections` | 切片库：按厚度与矿物占比筛选，回跳样本，批量标注质量（样本徽标同样只采信已确认分类） | ThinSection、MeteoriteSample |
| `/analysis` | 分析检测：录入 Fa / Fs / Ni / 铁纹石带宽，实时分类建议与阈值命中说明；**保存时固化本条意见快照，与已确认裁决冲突会把样本打回待复核** | AnalysisRecord、MeteoriteSample |
| `/locations` | 发现地分布：SVG 网格按经纬度打点、**按生效分类着色（待复核为灰色虚线圈）**、点选弹出样本清单 | FindRecord、MeteoriteSample |

## 分类复核工作流（v4）

同一块陨石多次检测可能给出不一致的分类建议，系统以「检测意见 → 待复核 → 策展人裁决」状态机保证采信结果可追溯：

1. **每条检测保留自己的意见**：检测保存时固化 `evaluation` 快照（分类建议、置信度、4 项阈值命中），后续规则调整或样本裁决变化都不改变历史意见。
2. **意见分歧即待复核**：同样本检测建议不一致（或尚无检测）时，样本标记为 `pending-review`，详情页列出各条依据与分歧原因；登记时的分类只作「初判」展示。
3. **策展人裁决才生效**：策展人核对各条依据后选定最终分类与化学群、**必须填写采信理由**、可勾选引用的检测记录。确认后样本变为 `confirmed`，详情、总览卡片、分类/化学群筛选、地图着色与地区统计才统一采用该结果。
4. **新检测可推翻旧裁决**：新增检测的建议与已确认分类不一致时，样本自动重新进入待复核，旧裁决（含理由、署名、引用依据）归档到 `decisionHistory` 继续可查，标记推翻原因与触发检测；策展人也可随时重新裁决，旧判断同样留痕。

## 数据模型（`src/types/` 独立文件）

- `types/sample.ts` — **MeteoriteSample**：id、样本编号、总重量 g、分类（登记初判）、化学群、风化等级 W0–W4、发现/坠落、存放位置；v4 起含复核状态 `classificationStatus`、策展人裁决 `classificationDecision`（最终分类/化学群/理由/署名/引用检测）与历史裁决 `decisionHistory`
- `types/find.ts` — **FindRecord**：id、关联样本、地名、国家地区、经纬度、坐标来源（GPS/文献）、发现环境、发现者
- `types/section.ts` — **ThinSection**：id、切片编号、关联样本、厚度 μm、制样方式、矿物占比、显微照片清单
- `types/analysis.ts` — **AnalysisRecord**：id、关联样本或切片、方法、橄榄石 Fa、辉石 Fs、Ni wt%、铁纹石带宽 mm、检测日期；v4 起保存时固化 `evaluation` 评估快照（建议 + 阈值命中）
- `utils/review.ts` — 复核状态机纯函数：检测意见汇总、分歧判定、生效分类取值、新检测推翻裁决的归档补丁

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
        ├── db/index.ts                 # Dexie 封装与 v1→v3 升级迁移
        ├── stores/{sampleStore,uiStore}.ts
        ├── components/common/{SampleCard,Badge,FieldGroup,EmptyState,CoordinatePicker,AppShell}.tsx
        ├── hooks/{useSampleFilter,useLocalDraft,useRegionStats}.ts
        ├── pages/{Overview,New,Detail,Sections,Analysis,Locations}.tsx
        ├── components/common/{SampleCard,Badge,ClassificationReviewPanel,FieldGroup,EmptyState,CoordinatePicker,AppShell}.tsx
        ├── router/index.tsx
        └── utils/{classify,review,format,geo}.ts
```

## 数据存储说明

- **库名**：`gbmeteorite-db`；表：`samples`、`finds`、`sections`、`analysis`
- **版本迁移**：
  - v1 建 `samples` / `finds` / `sections`
  - v2 新增 `analysis` 表并加 `sampleId` 索引
  - v3 为 `samples` 补 `updatedAt` 字段并按 id 回填旧记录
  - v4 引入分类复核状态机：旧库样本一律转为待复核（登记分类保留为初判），旧检测按当前规则补算评估快照
- **草稿**：`/samples/new` 与 `/analysis` 的表单草稿写入 localStorage（键前缀 `gbmeteorite:draft:`），切页自动恢复，提交后清理
- 首次打开会灌入 4 份演示样本（含已确认、无检测待复核、检测分歧且旧裁决被推翻留痕等场景）、3 条发现记录、2 张切片与 4 条检测记录，便于直接体验筛选、复核与打点

## 环境变量

| 变量 | 默认值 | 说明 |
| --- | --- | --- |
| `COMPOSE_PROJECT_NAME` | `gbmeteorite` | Compose 项目名与容器名前缀 |
| `FRONTEND_PORT` | `21825` | 宿主端口，映射到容器 80 |
