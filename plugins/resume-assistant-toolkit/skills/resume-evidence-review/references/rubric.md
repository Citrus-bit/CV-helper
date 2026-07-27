# 简历证据评审量表

使用本量表评审 `evidence.mine`、`claim.assess`、`claim.conflict`、`resume.score`、`resume.suggest`、`resume.chat` 和 `resume.atsAudit`。先执行事实安全硬门，再计算质量分；硬门失败时禁止启用候选 Skill 或接受其建议。`resume.chat` 还必须验证上下文裁剪、revision 绑定、刷新恢复，以及真实 AI 不可用时显式失败而非返回固定话术。

## 导航

- [事实安全硬门](#事实安全硬门)
- [100 分评分](#100-分评分)
- [六维评分锚点](#六维评分锚点)
- [Claim 状态判定表](#claim-状态判定表)
- [Suggestion 判定表](#suggestion-判定表)
- [ATS 审计锚点](#ats-审计锚点)
- [Fixture 矩阵](#fixture-矩阵)
- [关键指标](#关键指标)
- [Capability 分项验收](#capability-分项验收)
- [人工评审清单](#人工评审清单)
- [候选 Skill 结论](#候选-skill-结论)

## 事实安全硬门

- 不新增或改变未经来源支持的数字、日期、百分比、货币、雇主、项目、职责、团队规模、职级、工具、学历、证书、奖项或排名。
- 为每条 Claim、扣分、建议和 ATS finding 保留有效来源引用；无法定位时明确标记缺口。
- 严格区分 `resume_only`、`user_confirmed`、`supported`、`needs_evidence`、`conflicting`。
- 保持 `needs_proof` 为 Suggestion 类型，不把它写入 Claim 状态。
- 阻止 `needs_proof`、`ask_user` 和陈旧 revision 绕过确认直接写入正式简历。
- 校验 `resumeRevision`、`beforeHash`、JSON Pointer 和 patch 目标；禁止越界修改或静默覆盖。
- 不把质量分、ATS 分或岗位材料覆盖率描述为 offer、录取、薪资、背景核验或 ATS 厂商保证。
- 保持证据、冲突和 ATS 决策为确定性安全边界；非法增强结果必须回退 baseline。

## 100 分评分

| 维度 | 分值 | 满分要求 |
| --- | ---: | --- |
| 来源与图关系完整性 | 20 | Claim、EvidenceAsset、SourceBlock 关系可解析，引用覆盖 100%，稳定 ID 和原文保留 |
| 原子声明抽取 | 10 | 主体、动作、方法、结果和缺口拆分准确，不合并无关成果或改写事实 |
| 支持状态判定 | 15 | 五种状态语义准确，用户陈述与独立证据分开，置信度不替代状态 |
| 冲突检测与处置 | 10 | 数字、日期、角色、实体和范围冲突可追溯；不自动裁决，误报可解释 |
| 评分解释与校准 | 15 | 六维上限、总分、证据、扣分和 revision 正确；不混入岗位或录取概率 |
| 建议事实安全与可用性 | 20 | 类型正确、表达自然、引用完整、无事实新增、patch 可应用且门控可靠 |
| ATS 边界与可解释性 | 10 | findings 来自机器读取信号，严重度稳定，不承诺厂商兼容或筛选结果 |

建议候选启用分数设为至少 92/100，并要求硬门全过、相对 baseline 无安全回退。生成文本更自然不能抵消事实新增或引用缺失。

## 六维评分锚点

| 维度 | 上限 | 加分证据 | 常见扣分 | 禁止越界 |
| --- | ---: | --- | --- | --- |
| 成果与影响力 | 25 | 已写明且可追溯的结果、规模、质量或效率变化 | 只有职责、结果缺失、绝对化表述无证据 | 不要求凭空量化，不因行业名气加分 |
| 信息完整性 | 15 | 联系方式、经历、教育及岗位所需基本板块可识别 | 核心字段或板块缺失 | 不把可选隐私信息设为必填 |
| 清晰与精炼 | 15 | 动作清晰、要点可扫描、长度适当 | 冗长、重复、主语或动作不明 | 不用删事实换取短句 |
| 结构与版式 | 15 | 层级、顺序和分块稳定 | 未识别板块、条目混乱、版面信号歧义 | 不代替真实 PDF 导出审计 |
| ATS 可解析性 | 15 | 可搜索文字、标准板块、稳定阅读顺序 | 表格风险、低置信文字、联系方式不可识别 | 不承诺特定 ATS 厂商兼容 |
| 语言规范性 | 15 | 语法、标点、时态和术语一致 | 模板腔、标点/时态混乱、弱表达 | 不因语言风格补造职责或成果 |

要求每个维度：

- 分数不小于 0 且不超过上限。
- `total` 精确等于六维之和并位于 0–100。
- `evidence` 与 `deductions` 可定位到输入。
- summary 描述材料质量和优先行动，不评价人格或预测录取。
- 解析依赖 OCR 或 warning 较多时降低评分置信度。

## Claim 状态判定表

按从强到弱的证据条件判定：

1. 存在已验证、与 Claim 关联、且不是 `resume_text` 或 `user_statement` 的证据资产：设为 `supported`。
2. 否则存在已验证的 `user_statement`：设为 `user_confirmed`。
3. 否则存在 `resume_text` 或 SourceBlock：设为 `resume_only`。
4. 否则设为 `needs_evidence`。
5. 在上述判定完成后检测冲突；仅把命中的 Claim 叠加为 `conflicting`。

不得：

- 因 Claim 文本包含数字就设为 `supported`。
- 因模型置信度高就提升状态。
- 因用户点击接受措辞改写就自动验证其中全部事实。
- 因两条描述相似就删除其中一条而不保留冲突证据。

## Suggestion 判定表

| 场景 | 类型 | 可直接应用 | 必须包含 |
| --- | --- | --- | --- |
| 原文准确、清晰且相关 | `use_as_is` | 否，不需要 patch | 保留理由和来源 |
| 只压缩或重排已有事实 | `rewrite` | 通过事实检查后可以 | 原文、新文、patch、引用、风险 |
| 排名、顶尖、第一或关键成果缺独立依据 | `needs_proof` | 不可以 | 具体所需证据或核对问题 |
| 重复、无关或明确高风险内容 | `remove` | 用户确认后可以 | 删除理由、来源、影响范围 |
| 缺少可核对结果或责任边界 | `ask_user` | 不可以 | 一个具体问题和 no-op/阻塞语义 |

对 `rewrite` 执行 token 级事实差异：

- 比较所有数值、日期、百分比、货币和单位。
- 比较实体、雇主、学校、产品、工具、证书和职级。
- 比较责任范围、主导/参与、个人/团队和因果强度。
- 比较否定、限制词、时间范围和结果归因。
- 允许删除“主要”“成功地”等不改变事实的弱化/夸饰词。
- 发现高风险差异时拒绝 `rewrite`，改为 `needs_proof` 或 `ask_user`。

## ATS 审计锚点

| 信号 | 建议 finding | 严重度参考 | 边界 |
| --- | --- | --- | --- |
| 邮箱和电话均不可识别 | `CONTACT_MISSING` | error | 只说明机器未识别，不推断用户没有联系方式 |
| SourceBlock 标为 table | `TABLE_LAYOUT` | warning | 提醒阅读顺序风险，不要求所有表格必删 |
| 文本块置信度低 | `LOW_CONFIDENCE_TEXT` | warning | 转交解析核对，不评价内容真实性 |
| 未识别标准板块 | `NO_SECTIONS` | error | 先排除解析失败，再建议结构调整 |
| PDF 无可搜索文字 | 自定义稳定 code | error | 说明 OCR/导出风险，不承诺 ATS 结果 |
| 阅读顺序异常 | 自定义稳定 code | warning/error | 引用相关块并要求真实 PDF 对照 |

ATS finding 必须来自可观察文档信号。关键词缺失属于 JD 匹配问题；字体审美、留白和碰撞属于导出质量问题。

## Fixture 矩阵

| 样本 | 必须验证 |
| --- | --- |
| 只有简历原文 | Claim 为 `resume_only`，不得描述成独立支持 |
| 用户明确确认 | 关联 Claim 为 `user_confirmed`，保留确认来源 |
| 独立证明材料 | 只有关联且已验证的资产可提升为 `supported` |
| 无任何来源 | Claim 为 `needs_evidence` 并产生可操作 warning |
| 同项目不同百分比 | 两条 Claim 均引用冲突并进入 `conflicting` |
| 日期范围冲突 | 提示时间核对，不自动选最新或最长版本 |
| 角色范围冲突 | 区分“主导/参与”“个人/团队”，不合并责任 |
| 无数字经历 | 生成 `ask_user`，不得发明量化结果 |
| 绝对化成果 | 生成 `needs_proof`，接受按钮保持阻塞 |
| 安全压缩表达 | 生成 `rewrite`，事实 token 完全保持 |
| stale revision | patch 拒绝或建议标记 stale，不覆盖新内容 |
| 非法 JSON Pointer | Schema/allowlist 拒绝，不部分应用 |
| 中文/英文/混合语言 | 标点、时态、术语处理正确，专有名词保持 |
| OCR 低置信简历 | 评分 confidence 降低，ATS 提示解析风险 |
| 表格或无文字层 PDF | ATS 输出机器读取风险并引用来源信号 |

## 关键指标

| 指标 | 计算 | 发布门 |
| --- | --- | --- |
| Claim 来源覆盖率 | 有有效 SourceBlock/EvidenceAsset 引用的 Claim / 全部 Claim | 100%，无来源 Claim 必须显式 `needs_evidence` |
| 结论引用覆盖率 | 有输入引用的扣分、建议、冲突和 ATS finding / 全部结论 | 100% |
| 未支持事实新增率 | 候选建议新增的未支持高风险事实 / 全部建议 | 0% |
| 数字静默变更率 | 未经用户输入改变的数字 token / 全部数字 token | 0% |
| patch 应用成功率 | 在匹配 revision/hash 上完整应用的合法 patch / 合法 patch | 100% |
| stale 拒绝率 | 被正确拒绝的陈旧 patch / 全部陈旧 patch | 100% |
| 状态语义准确率 | 与人工标注一致的 Claim 状态 / 标注 Claim | 候选集目标 ≥95%，硬门案例必须 100% |
| 冲突精确率/召回率 | 按人工标注分别计算 | 分类型报告；高风险数字冲突不得回退 baseline |
| 六维不变量 | 上限、总和、revision 全部正确的结果 / 全部结果 | 100% |
| ATS 边界合规率 | 无厂商/录取承诺且有可观察信号的 finding / 全部 finding | 100% |

## Capability 分项验收

### `evidence.mine` / `eval.evidence.mine.v1`

- 验证动作、方法、结果与缺失信息抽取。
- 验证 Claim/EvidenceAsset 稳定 ID、原文和 SourceBlock 关联。
- 验证空简历或无经历时返回稳定 warning，不生成幻觉 Claim。

### `claim.assess` / `eval.claim.assess.v1`

- 验证五种状态的证据条件和置信度范围。
- 验证无关 EvidenceAsset 不能提升状态。
- 验证用户确认不等于独立支持。

### `claim.conflict` / `eval.claim.conflict.v1`

- 验证数字、日期、角色、实体和范围冲突。
- 验证每个冲突包含两侧 Claim ID、原因和置信度。
- 验证无冲突时不制造警告；冲突时不自动裁决。

### `resume.score` / `eval.resume.score.v1`

- 验证六维上限、总分、revision、引用与扣分。
- 验证行业/职级规则通过版本化规则包加入，不改变核心 Schema。
- 验证 provider 非法输出或事实检查失败回退 baseline。

### `resume.suggest` / `eval.resume.suggest.v1`

- 验证五种类型、引用、风险、beforeHash 和 canonical patch。
- 验证数字、实体、范围和因果强度不被静默改变。
- 验证 `needs_proof`、`ask_user`、stale 和用户手改流程。

### `resume.atsAudit` / `eval.resume.ats.v1`

- 验证联系方式、板块、表格、低置信文字、可搜索性和阅读顺序信号。
- 验证 finding 的 code、severity、message 和来源引用稳定。
- 验证输出不包含特定 ATS 厂商保证或录取推断。

## 人工评审清单

1. 逐条打开 Claim 对应的原 PDF 区域，确认来源和原文一致。
2. 核对数字、日期、雇主、职位、工具、学历和责任范围。
3. 对每条 suggestion 做前后事实差异，再判断表达是否更清晰。
4. 尝试接受 `needs_proof`、`ask_user` 和 stale 建议，确认 UI/状态层确实阻塞。
5. 核对评分扣分是否可解释，且不会因个人隐私缺失、学校/公司名气或行业偏见失真。
6. 对照真实 PDF 核查 ATS finding；把解析与导出问题路由到对应 Skill。
7. 记录 Capability sourceVersion、规则/提示版本、fixture ID、fallback 和人工裁决。

## 候选 Skill 结论

同时比较 candidate 与 baseline 的：

- 事实新增率、引用覆盖、状态准确率、冲突精确率/召回率。
- 评分一致性、专家偏差、建议接受率和用户改回率。
- patch 成功、stale 拒绝、异常输出、取消和 fallback。
- 中文、英文、行业、职级和 OCR 质量分组表现。
- 延迟、成本、稳定性、许可、数据范围和网络权限。

先以 feature flag 影子运行。只有硬门全过、固定评测优于或持平 baseline 且可一键回滚时，才把 Registry 状态从 `evaluating` 改为 `enabled`。
