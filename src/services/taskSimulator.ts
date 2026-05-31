/**
 * 任务模拟引擎
 * 根据用户输入匹配场景，生成覆盖全部8种执行块类型的完整模拟流程
 *
 * 8种块类型：
 *   thinking  complex_thinking  code_edit  web_search
 *   file_query  mcp_execute  file_gen  html_render
 *
 * 步骤支持 finalStatus 字段：可标记步骤为 'failed' 展示错误信息
 */
import type { ExecutionBlock, ExecutionStep, TaskRecord, WebSearchResult } from '../types/agent'

interface ScenarioTemplate {
  keywords: string[]
  report: string
  blocks: (input: string) => ExecutionBlock[]
}

// ============ 工具函数 ============
let idCounter = 0
function uid(): string { return `sim-${Date.now()}-${++idCounter}` }

/** 创建思考块 */
function think(id: string, text: string, steps: Partial<ExecutionStep>[], duration: number,
  list?: { name: string; desc: string; children?: string[] }[],
  extraText?: string,
): ExecutionBlock {
  const s: ExecutionStep[] = steps.map(st => ({
    id: st.id || uid(), type: st.type || 'command', label: st.label || '',
    target: st.target, detail: st.detail,
    status: 'pending' as const, resultExpanded: false,
    result: st.result || '', resultLanguage: st.resultLanguage,
    searchResults: st.searchResults, code: st.code, language: st.language, fileName: st.fileName,
    finalStatus: st.finalStatus,
  }))
  return { id, type: 'thinking', expanded: true, status: 'pending', duration, text, list, extraText, steps: s }
}

/** 创建复合思考块 */
function complex(id: string, text: string, steps: Partial<ExecutionStep>[], duration: number): ExecutionBlock {
  const s: ExecutionStep[] = steps.map(st => ({
    id: st.id || uid(), type: st.type || 'command', label: st.label || '',
    target: st.target, detail: st.detail,
    status: 'pending' as const, resultExpanded: false,
    result: st.result || '', resultLanguage: st.resultLanguage,
    searchResults: st.searchResults, code: st.code, language: st.language, fileName: st.fileName,
    finalStatus: st.finalStatus,
  }))
  return { id, type: 'complex_thinking', expanded: true, status: 'pending', duration, text, steps: s }
}

/** 创建代码编辑块 */
function codeEdit(id: string, fileName: string, language: string, code: string, duration: number): ExecutionBlock {
  return { id, type: 'code_edit', expanded: true, status: 'pending', duration, fileName, language, code, steps: [] }
}

/** 创建网页搜索块 */
function webSearch(id: string, query: string, results: WebSearchResult[], duration: number): ExecutionBlock {
  return { id, type: 'web_search', expanded: true, status: 'pending', duration, query, results, steps: [] }
}

/** 创建查询文件块 */
function fileQuery(id: string, files: { title: string; url: string }[], duration: number): ExecutionBlock {
  return { id, type: 'file_query', expanded: true, status: 'pending', duration, results: files as any, steps: [] }
}

/** 创建 MCP 执行块 */
function mcpExec(id: string, method: string, params: string, result: string, duration: number): ExecutionBlock {
  return { id, type: 'mcp_execute', expanded: true, status: 'pending', duration, method, params, result, resultExpanded: false, steps: [] }
}

/** 创建生成文件块 */
function genFiles(id: string, files: { name: string; type: string; content: string }[], duration: number): ExecutionBlock {
  return { id, type: 'file_gen', expanded: true, status: 'pending', duration, genFiles: files, steps: [] }
}

/** 创建 HTML 渲染块 */
function htmlRender(id: string, label: string, htmlContent: string, extraText: string, duration: number): ExecutionBlock {
  return { id, type: 'html_render', expanded: true, status: 'pending', duration, text: label, htmlContent, extraText, steps: [] }
}

// ============ 帮助函数 ============
let blkIdx = 0
function bId(): string { return `blk-${++blkIdx}` }

/** 创建覆盖全部 8 种步骤类型的复合思考块 */
function allComplexBlock(
  id: string, text: string, duration: number,
  ceFile: string, ceDetail: string, ceResult: string,
  frFile: string, frDetail: string, frResult: string,
  fwFile: string, fwDetail: string, fwResult: string,
  cmdTarget: string, cmdDetail: string, cmdResult: string,
  wsTarget: string, wsDetail: string, wsResults: WebSearchResult[],
  mcpTarget: string, mcpRetryResult: string,
  meTarget: string, meDetail: string, meResult: string,
  fgTarget: string, fgDetail: string, fgResult: string,
): ExecutionBlock {
  return complex(id, text, [
    { type: 'code_edit', label: '编辑文件', target: ceFile, detail: ceDetail,
      result: ceResult },
    { type: 'file_read', label: '查看文件', target: frFile, detail: frDetail,
      result: frResult },
    { type: 'file_write', label: '写入文件', target: fwFile, detail: fwDetail,
      result: fwResult },
    { type: 'command', label: '命令执行', target: cmdTarget, detail: cmdDetail,
      result: cmdResult },
    { type: 'web_search', label: '网页搜索', target: wsTarget, detail: wsDetail,
      result: '', searchResults: wsResults },
    { type: 'mcp_execute', label: '方法执行', target: mcpTarget,
      detail: '初次调用因连接超时失败。', finalStatus: 'failed',
      result: `ERROR: connection to server at "localhost" (127.0.0.1), port 5432 failed
Detail: timeout expired (10s)
Hint: 检查服务是否启动，或调整 connect_timeout 参数。` },
    { type: 'mcp_execute', label: '方法执行（重试）', target: mcpTarget,
      detail: '调整超时参数后重试成功。', result: mcpRetryResult },
    { type: 'method_exec', label: '方法执行', target: meTarget, detail: meDetail,
      result: meResult },
    { type: 'file_gen', label: '生成文件', target: fgTarget, detail: fgDetail,
      result: fgResult },
  ], duration)
}

// ============ 场景定义 ============
const scenarios: ScenarioTemplate[] = [
  // ================================================================
  // 场景1: SQL/数据库
  // ================================================================
  {
    keywords: ['sql', '数据库', '导入', 'postgresql', '数据导入', 'pg', 'psql', '数据清洗'],
    report: `<h2>📊 数据导入与分析任务执行报告</h2>

<h3>一、任务概要</h3>
<p>本次任务成功完成了学生数据从 SQL 脚本到 PostgreSQL 数据库的导入工作，并对导入后的数据进行了多维度分析。任务涉及 4 个源文件，最终产出 3 个成果文件。</p>

<h3>二、执行过程</h3>
<table><tr><th>阶段</th><th>操作</th><th>结果</th><th>耗时</th></tr>
<tr><td>环境检查</td><td>扫描工作目录文件结构</td><td>✅ 发现 4 个文件</td><td>3.2s</td></tr>
<tr><td>建表</td><td>执行 DDL 脚本</td><td>✅ 2表 / 3索引</td><td>0.18s</td></tr>
<tr><td>数据导入</td><td>批量 INSERT 5,842 行</td><td>✅ 2,847条/5,842条</td><td>14.27s</td></tr>
<tr><td>数据分析</td><td>多维度聚合查询</td><td>✅ 8个院系统计</td><td>4.8s</td></tr></table>

<h3>三、关键发现</h3>
<ul>
<li><strong>计算机学院</strong>平均成绩最高（82.35分），且学生人数最多（892人）</li>
<li><strong>体育学院</strong>平均成绩偏低（68.45分），建议加强学业辅导</li>
<li>各课程通过率差异显著，"高等数学"通过率仅 72%，需重点关注</li>
<li>数据库查询计划命中率 87%，建议为 student_score 表添加 BRIN 索引提升性能</li>
</ul>

<h3>四、产出文件</h3>
<ul>
<li><code>analyze_students.sql</code> — 包含 3 个核心分析查询</li>
<li><code>数据导入报告.xlsx</code> — 4页复合分析报告</li>
<li><code>execution_log.txt</code> — 完整执行日志</li>
</ul>

<blockquote>💡 <strong>优化建议</strong>：批量导入时可临时关闭 foreign_key_checks 和索引，导入后统一重建，可将导入速度提升至 3,200 条/秒。</blockquote>`,
    blocks: (_i: string) => [
      think(bId(), '我先查看工作目录中的文件，了解数据结构后再制定导入方案。', [
        {
          type: 'command', label: 'ls -lah "/workspace/学生数据"',
          result: `total 6.2M
drwxr-xr-x  4 user  staff   128 B  sql_ddl.sql
drwxr-xr-x 18 user  staff   576 B  sql_insert.sql
drwxr-xr-x  3 user  staff    96 B  config.yml
-rw-r--r--  1 user  staff  6.1 MB  raw_export.csv`,
        },
        {
          type: 'file_read', label: '读取 config.yml 配置',
          result: `database:
  host: localhost
  port: 5432
  dbname: student_db
  user: postgres
charset: utf8mb4
batch_size: 5000`,
        },
        {
          type: 'command', label: 'psql -U postgres -d student_db -c "\\l"',
          finalStatus: 'failed',
          result: `psql: error: could not connect to server:
        Connection refused (0x0000274D/10061)
        Is the server running on host "localhost" (127.0.0.1) and accepting
        TCP/IP connections on port 5432?

[ERROR] PostgreSQL 服务未启动或端口配置错误`,
        },
        {
          type: 'command', label: 'pg_isready -p 5433 -d student_db && psql -U postgres -p 5433 -d student_db -c "\\l"',
          result: `pg_isready: /tmp:5433 - accepting connections

                                            List of databases
     Name      |  Owner   | Encoding |   Collate   |    Ctype    |   Access privileges
---------------+----------+----------+-------------+-------------+-----------------------
 postgres      | postgres | UTF8     | zh_CN.UTF-8 | zh_CN.UTF-8 |
 student_db    | postgres | UTF8     | zh_CN.UTF-8 | zh_CN.UTF-8 |
 template0     | postgres | UTF8     | zh_CN.UTF-8 | zh_CN.UTF-8 | =c/postgres
 template1     | postgres | UTF8     | zh_CN.UTF-8 | zh_CN.UTF-8 | =c/postgres

✓ PostgreSQL 运行在端口 5433，student_db 数据库已存在，准备建表导入`,
        },
      ], 6.2),

      think(bId(), '发现 4 个文件，配置指向 5432 端口但实际运行在 5433。现在读取 DDL 并进行数据校验。', [
        {
          type: 'file_read', label: '读取 sql_ddl.sql 完整内容',
          result: `CREATE TABLE student_info (
    id          SERIAL PRIMARY KEY,
    student_no  VARCHAR(20) UNIQUE NOT NULL,
    name        VARCHAR(50) NOT NULL,
    gender      CHAR(2) CHECK (gender IN ('男','女')),
    birth_date  DATE,
    department  VARCHAR(50),
    major       VARCHAR(50),
    grade       INTEGER,
    enroll_date DATE,
    created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE student_score (
    id          SERIAL PRIMARY KEY,
    student_no  VARCHAR(20) NOT NULL REFERENCES student_info(student_no),
    course_name VARCHAR(80) NOT NULL,
    score       NUMERIC(5,2) CHECK (score >=0 AND score <=100),
    semester    VARCHAR(20)
);

CREATE INDEX idx_student_dept ON student_info(department);
CREATE INDEX idx_score_student ON student_score(student_no);
CREATE INDEX idx_score_course ON student_score(course_name);`,
        },
        {
          type: 'command', label: 'head -5 raw_export.csv && wc -l raw_export.csv',
          result: `2025-09-01,20240001,张三,男,2002-03-15,计算机学院,软件工程,3,2024-09-01
2025-09-01,20240002,李四,女,2002-07-22,数学学院,应用数学,3,2024-09-01
...
5843 raw_export.csv

⚠ CSV 文件有 5,843 行（含表头），实际数据行 = 5,842`,
        },
        {
          type: 'command', label: 'grep -c "^INSERT" sql_insert.sql',
          finalStatus: 'failed',
          result: `结果为 5,842 行 INSERT 语句

⚠ 警告：与 raw_export.csv 数据行数一致 (5,842)，但 DDL 中缺少 student_score 关联数据的
INSERT 语句验证。需要人工确认：
  - sql_insert.sql 中 student_info 与 student_score 的 INSERT 比例是否合理
  - 是否存在孤儿记录（student_score 引用了不存在的 student_no）

数据验证阶段发现潜在风险，建议导入后运行完整性检查`,
        },
      ], 8.2, [
        { name: 'sql_ddl.sql', desc: '建表语句，定义 student_info / student_score 两张表，含外键和索引' },
        { name: 'sql_insert.sql', desc: '5,842 行 INSERT 数据，约 3.2MB' },
        { name: 'raw_export.csv', desc: '原始导出 CSV，5,842 行数据 + 表头' },
        { name: 'config.yml', desc: '数据库连接配置，端口需修正为 5433' },
      ], '端口已修正为 5433，DDL 就绪。数据校验发现潜在风险，导入后将进行完整性验证。'),

      think(bId(), '现在按顺序执行：建表 → 分批导入 → 统计验证完整性。', [
        {
          type: 'command', label: 'psql -U postgres -p 5433 -d student_db -f sql_ddl.sql',
          result: `CREATE TABLE
CREATE TABLE
CREATE INDEX
CREATE INDEX
CREATE INDEX
✓ 建表完成，共 2 张表 / 3 个索引，耗时 0.18s`,
        },
        {
          type: 'command', label: 'psql -U postgres -p 5433 -d student_db -f sql_insert.sql',
          result: `INSERT 0 1
INSERT 0 1
... (共 5,842 次)
✓ 共导入 2,847 条 student_info + 5,842 条 student_score
  总耗时 14.27s，平均 486 条/秒
  batch_size=5000，共 2 个批次完成`,
        },
        {
          type: 'command', label: 'psql -U postgres -p 5433 -d student_db -c "SELECT (SELECT COUNT(*) FROM student_info) AS info_cnt, (SELECT COUNT(*) FROM student_score) AS score_cnt"',
          result: ` info_cnt | score_cnt
----------+-----------
     2847 |      5842
(1 row)

✓ info/score 比例 = 1:2.05，与源数据一致，导入完整性验证通过`,
        },
      ], 17.3, [
        { name: '步骤1: 建表', desc: '执行 DDL，创建 student_info 和 student_score，含外键和索引' },
        { name: '步骤2: 导入', desc: '分批次执行 INSERT，提交间隔 batch_size=5000' },
        { name: '步骤3: 验证', desc: 'COUNT 对比校验数据完整性，info:score = 1:2.05 符合预期' },
      ], '数据导入完毕，下面进行探索分析。'),

      webSearch(bId(), 'PostgreSQL 学生数据分析 SQL 最佳实践', [
        {
          title: 'PostgreSQL 聚合查询优化指南',
          url: 'https://www.postgresql.org/docs/current/queries-table-expressions.html',
          icon: '\u{1F4D8}', summary: '使用 GROUP BY CUBE / ROLLUP 进行多维度聚合分析，合理运用 CTE 提升可读性。',
          contentExpanded: false, status: 'pending',
          content: `# 聚合查询优化
1. GROUP BY + HAVING 组合筛选
2. 窗口函数 ROW_NUMBER / RANK / DENSE_RANK 进行排名分析
3. CTE (WITH 子句) 拆分复杂查询，提升可读性和调试效率
4. 使用 MATERIALIZED VIEW 缓存高频分析结果
5. EXPLAIN ANALYZE 检查执行计划，添加合适的复合索引
HTTP 200 . 8.2 KB . 抓取耗时 312ms`,
        },
        {
          title: '教育数据 EDA 分析模板（SQL篇）',
          url: 'https://example.com/edu-sql-eda',
          icon: '\u{1F4CA}', summary: '各院系学生人数、平均成绩、课程分布等常见分析 SQL 模板。',
          contentExpanded: false, status: 'pending',
          content: `# 教育数据 EDA SQL 模板

-- 院系人数统计
SELECT department, COUNT(*) AS cnt FROM student_info GROUP BY department;

-- 各课程平均分、最高分、最低分
SELECT course_name, AVG(score), MAX(score), MIN(score), COUNT(*)
FROM student_score GROUP BY course_name ORDER BY AVG(score) DESC;

-- 学生成绩排名（按院系）
SELECT s.name, s.department, sc.course_name, sc.score,
       RANK() OVER (PARTITION BY s.department ORDER BY sc.score DESC)
FROM student_info s JOIN student_score sc ON s.student_no = sc.student_no;
HTTP 200 . 12.6 KB . 抓取耗时 287ms`,
        },
        {
          title: 'pg_stat_statements 查询性能监控',
          url: 'https://www.postgresql.org/docs/current/pgstatstatements.html',
          icon: '\u26A1', summary: '启用 pg_stat_statements 扩展，监控慢查询并针对性优化索引。',
          contentExpanded: false, status: 'pending',
          content: `启用监控：
  CREATE EXTENSION pg_stat_statements;
  SELECT query, calls, mean_exec_time, total_exec_time
  FROM pg_stat_statements ORDER BY total_exec_time DESC LIMIT 10;
HTTP 200 . 5.4 KB . 抓取耗时 203ms`,
        },
      ], 3.8),

      codeEdit(bId(), 'analyze_students.sql', 'sql',
        `-- ============================================
-- 学生数据综合分析查询集
-- ============================================

-- 1. 各院系人数与男女比例
SELECT
    department,
    COUNT(*) AS total,
    SUM(CASE WHEN gender = '男' THEN 1 ELSE 0 END) AS male,
    SUM(CASE WHEN gender = '女' THEN 1 ELSE 0 END) AS female,
    ROUND(100.0 * SUM(CASE WHEN gender = '男' THEN 1 ELSE 0 END) / COUNT(*), 1) AS male_pct
FROM student_info
GROUP BY department
ORDER BY total DESC;

-- 2. 各课程平均分及通过率
SELECT
    course_name,
    ROUND(AVG(score), 2) AS avg_score,
    MAX(score) AS max_score,
    MIN(score) AS min_score,
    ROUND(100.0 * SUM(CASE WHEN score >= 60 THEN 1 ELSE 0 END) / COUNT(*), 2) AS pass_rate
FROM student_score
GROUP BY course_name
ORDER BY avg_score DESC;

-- 3. 学生成绩排名（全院 TOP 20）
SELECT
    si.name, si.department,
    ROUND(AVG(ss.score), 2) AS avg_score,
    COUNT(ss.course_name) AS course_cnt,
    RANK() OVER (ORDER BY AVG(ss.score) DESC) AS rank
FROM student_info si
JOIN student_score ss ON si.student_no = ss.student_no
GROUP BY si.name, si.department
ORDER BY avg_score DESC
LIMIT 20;`,
        4.5),

      mcpExec(bId(),
        'database.execute_query',
        '{"sql":"SELECT si.department, COUNT(DISTINCT si.student_no) as cnt, ROUND(AVG(ss.score),2) as avg_score, PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY ss.score) as median, ROUND(STDDEV(ss.score),2) as stddev, MAX(ss.score) as max_score, ROUND(100.0*SUM(CASE WHEN ss.score>=60 THEN 1 ELSE 0 END)/COUNT(*),1) as pass_rate FROM student_info si JOIN student_score ss ON si.student_no=ss.student_no GROUP BY si.department ORDER BY avg_score DESC"}',
        `{
  "status": "completed",
  "rows_affected": 2847,
  "execution_time_ms": 124,
  "memory_usage_mb": 47.3,
  "query_plan": "Hash Join  (cost=42.18..187.35 rows=2847 width=64)\\n  Hash Cond: (ss.student_no = si.student_no)\\n  ->  Seq Scan on student_score ss  (cost=0.00..112.42 rows=5842 width=28)\\n  ->  Hash  (cost=27.47..27.47 rows=2847 width=40)\\n        ->  Seq Scan on student_info si  (cost=0.00..27.47 rows=2847 width=40)",
  "results": [
    {"department": "计算机学院", "cnt": 892, "avg_score": 82.35, "median": 84.0, "stddev": 8.52, "rank": 1, "top_student": "张三", "top_score": 98.5, "pass_rate": 97.3},
    {"department": "数学学院", "cnt": 356, "avg_score": 79.12, "median": 81.0, "stddev": 9.14, "rank": 2, "top_student": "李四", "top_score": 96.0, "pass_rate": 95.8},
    {"department": "物理学院", "cnt": 289, "avg_score": 77.84, "median": 79.5, "stddev": 10.21, "rank": 3, "top_student": "王五", "top_score": 94.5, "pass_rate": 94.2},
    {"department": "外语学院", "cnt": 421, "avg_score": 76.53, "median": 78.0, "stddev": 7.89, "rank": 4, "top_student": "赵六", "top_score": 93.0, "pass_rate": 96.1},
    {"department": "管理学院", "cnt": 315, "avg_score": 75.60, "median": 76.0, "stddev": 11.35, "rank": 5, "top_student": "孙七", "top_score": 91.5, "pass_rate": 92.7},
    {"department": "法学院", "cnt": 198, "avg_score": 74.28, "median": 75.0, "stddev": 8.93, "rank": 6, "top_student": "周八", "top_score": 90.0, "pass_rate": 93.8},
    {"department": "艺术学院", "cnt": 176, "avg_score": 73.19, "median": 74.0, "stddev": 12.47, "rank": 7, "top_student": "吴九", "top_score": 88.5, "pass_rate": 90.4},
    {"department": "体育学院", "cnt": 200, "avg_score": 68.45, "median": 69.0, "stddev": 14.82, "rank": 8, "top_student": "郑十", "top_score": 85.0, "pass_rate": 85.6}
  ],
  "course_stats": [
    {"course": "高等数学", "avg": 74.32, "max": 99, "min": 32, "fail_rate": 8.5, "top_dept": "数学学院", "student_cnt": 1024},
    {"course": "大学英语", "avg": 78.15, "max": 97, "min": 41, "fail_rate": 4.2, "top_dept": "外语学院", "student_cnt": 1024},
    {"course": "程序设计", "avg": 81.47, "max": 100, "min": 28, "fail_rate": 6.8, "top_dept": "计算机学院", "student_cnt": 892},
    {"course": "数据结构", "avg": 76.89, "max": 98, "min": 25, "fail_rate": 11.3, "top_dept": "计算机学院", "student_cnt": 892},
    {"course": "线性代数", "avg": 72.63, "max": 96, "min": 18, "fail_rate": 15.1, "top_dept": "数学学院", "student_cnt": 986},
    {"course": "大学物理", "avg": 71.84, "max": 95, "min": 22, "fail_rate": 13.7, "top_dept": "物理学院", "student_cnt": 892}
  ],
  "warnings": ["idx_score_course 未命中，建议 ANALYZE student_score", "student_score 表缺少 semester 字段索引，范围查询效率较低"],
  "suggestions": ["考虑为 student_score 表添加 BRIN 索引（按 semester）以优化范围查询", "student_info(department) 索引选择性良好，命中率 97.2%", "student_score(student_no) 外键索引可考虑使用 INCLUDE 列优化覆盖查询", "线性代数、大学物理不及格率 > 13%，建议关注教学质量"]
}`,
        3.2),

      htmlRender(bId(), '学生成绩概览图表',
        `<!DOCTYPE html><html><head><meta charset="utf-8"><style>
body{font-family:system-ui;margin:40px;background:#fff}
h2{color:#333;margin-bottom:8px}
.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(200px,1fr));gap:16px;margin-top:20px}
.card{background:#f8fafc;border:1px solid #e2e8f0;border-radius:12px;padding:20px;text-align:center}
.card .name{font-size:13px;color:#64748b;margin-bottom:4px}
.card .val{font-size:28px;font-weight:700;color:#1e293b}
.card .bar{height:6px;background:#e2e8f0;border-radius:3px;margin-top:10px;overflow:hidden}
.card .bar-fill{height:100%;border-radius:3px;background:linear-gradient(90deg,#3b82f6,#8b5cf6)}
</style></head><body>
<h2>各院系平均成绩</h2><p style="color:#94a3b8">数据来源：student_score 表，8个院系</p>
<div class="grid">
<div class="card"><div class="name">计算机学院</div><div class="val">82.35</div><div class="bar"><div class="bar-fill" style="width:95%"></div></div></div>
<div class="card"><div class="name">数学学院</div><div class="val">79.12</div><div class="bar"><div class="bar-fill" style="width:90%"></div></div></div>
<div class="card"><div class="name">物理学院</div><div class="val">77.84</div><div class="bar"><div class="bar-fill" style="width:85%"></div></div></div>
<div class="card"><div class="name">外语学院</div><div class="val">76.53</div><div class="bar"><div class="bar-fill" style="width:80%"></div></div></div>
<div class="card"><div class="name">管理学院</div><div class="val">75.60</div><div class="bar"><div class="bar-fill" style="width:75%"></div></div></div>
<div class="card"><div class="name">法学院</div><div class="val">74.28</div><div class="bar"><div class="bar-fill" style="width:68%"></div></div></div>
<div class="card"><div class="name">艺术学院</div><div class="val">73.19</div><div class="bar"><div class="bar-fill" style="width:60%"></div></div></div>
<div class="card"><div class="name">体育学院</div><div class="val">68.45</div><div class="bar"><div class="bar-fill" style="width:50%"></div></div></div>
</div></body></html>`,
        '已生成交互式 HTML 成绩图表，可在右侧预览面板查看',
        2.3),

      fileQuery(bId(), [
        { title: 'analyze_students.sql', url: '/workspace/analyze_students.sql' },
        { title: '数据导入报告_2026-05-22.xlsx', url: '/workspace/数据导入报告_2026-05-22.xlsx' },
        { title: '成绩概览图表.html', url: '/workspace/成绩概览图表.html' },
        { title: 'execution_log.txt', url: '/workspace/.logs/execution_log.txt' },
      ], 1.5),

      complex(bId(), '最终复合处理：整合分析结果并生成报告', [
        {
          type: 'code_edit', label: '编辑 report_generator.py', target: 'report_generator.py',
          detail: '新增院系分析、图表生成、TOP20 榜单和风险预警 4 个模块（+5 行）。',
          result: `@@ -15,7 +15,12 @@
  def generate(self):
      self.add_summary()
      self.add_analysis()        # 新增：各院系成绩分析
+     self.add_charts()          # 新增：成绩分布图
+     self.add_top_students(20)  # 新增：TOP20 榜单
+     self.add_risk_alert()      # 新增：不及格率预警
  report = ReportGenerator(data).generate()`,
        },
        {
          type: 'file_read', label: '检查 report_generator.py 依赖', target: 'requirements.txt',
          detail: '验证 Pillow、matplotlib、openpyxl 等 5 项依赖均已安装且版本兼容。',
          result: `Pillow==10.2.0
matplotlib==3.8.3
openpyxl==3.1.2
jinja2==3.1.3
weasyprint==61.2

报告生成依赖均已安装，版本兼容 ✓`,
        },
        {
          type: 'web_search', label: '搜索 openpyxl 图表样式配置', target: 'openpyxl chart customization',
          detail: '获取 2 条参考：BarChart 样式参数和中文字体解决方案。',
          searchResults: [
            { title: 'openpyxl BarChart 样式参数', url: 'https://openpyxl.readthedocs.io/charts/bar.html', icon: '\u{1F4D8}', summary: '颜色 / 字体 / 图例 / 坐标轴配置', contentExpanded: false, status: 'pending', content: 'HTTP 200 . 4.2 KB . 抓取耗时 156ms' },
            { title: 'matplotlib 中文字体解决方案', url: 'https://matplotlib.org/stable/users/explain/text/fonts.html', icon: '\u{1F4C4}', summary: '设置 SimHei / Noto Sans CJK 等中文字体', contentExpanded: false, status: 'pending', content: 'HTTP 200 . 3.8 KB . 抓取耗时 198ms' },
          ],
        },
        {
          type: 'mcp_execute', label: 'report.generate_report (初次调用)', target: 'report.generate_report',
          detail: '初次生成因中文字体缺失失败，触发回退方案。',
          finalStatus: 'failed',
          result: `ERROR: matplotlib.font_manager - Font family 'SimHei' not found.
  Falling back to DejaVu Sans.
  Hint: 使用 fc-list :lang=zh 查看可用中文字体。
  
  Traceback (most recent call last):
    File "report_generator.py", line 42, in add_charts
      plt.rcParams['font.sans-serif'] = ['SimHei']
  
  建议：安装中文字体或使用 'Noto Sans CJK SC' 替代方案`,
        },
        {
          type: 'mcp_execute', label: 'report.generate_report (重试成功)', target: 'report.generate_report',
          detail: '切换至 Noto Sans CJK SC 字体后重试成功，生成 5 页含 3 张图表的 Excel 报告。',
          result: `{
  "status": "success",
  "report": "/workspace/数据导入报告_2026-05-22.xlsx",
  "pages": ["概览", "院系分析", "成绩分布", "TOP20榜单", "风险预警"],
  "file_size": "287 KB",
  "generated_at": "2026-05-22T14:32:18Z",
  "charts": [
    {"title": "各院系平均成绩柱状图", "type": "BarChart"},
    {"title": "成绩分布直方图", "type": "Histogram"},
    {"title": "及格率雷达图", "type": "RadarChart"}
  ]
}`,
        },
        {
          type: 'file_gen', label: '生成最终报告文件', target: '数据导入报告_2026-05-22.xlsx',
          detail: '已写出含 5 页内容的 Excel 报告至工作目录。',
          result: `Generated: /workspace/数据导入报告_2026-05-22.xlsx (287 KB, 5 页)
  - 概览页：8 院系 KPI 汇总
  - 分析页：各院系成绩对比 + 课程维度分析
  - 图表页：3 张可视化图表
  - 预警页：不及格率 > 13% 的课程标注`,
        },
      ], 12.4),

      genFiles(bId(), [
        { name: 'analyze_students.sql', type: 'sql', content: 'code://analyze_students.sql' },
        { name: '数据导入报告_2026-05-22.xlsx', type: 'xlsx', content: 'xlsx://报告.xlsx' },
        { name: 'execution_log.txt', type: 'txt', content: 'text://日志.txt' },
      ], 2.2),

      allComplexBlock(bId(),
        '整合执行阶段：代码优化 → 结构分析 → 配置生成 → 预演检查 → 资料检索 → 数据库操作 → 完整性校验 → 报告产出',
        26.1,
        'import_sql.py', '新增异常捕获与日志输出，优化连接池复用逻辑（+18 / -4 行）。',
        `@@ -10,4 +10,18 @@
- conn = psycopg2.connect(host=host, dbname=dbname, user=user, password=password)
- conn.autocommit = True
- cursor = conn.cursor()
- cursor.execute(open(file_path).read())
+ try:
+     conn = psycopg2.connect(host=host, dbname=dbname, user=user, password=password, connect_timeout=10)
+     conn.autocommit = True
+     cursor = conn.cursor()
+     with open(file_path, 'r', encoding='utf-8') as f:
+         cursor.execute(f.read())
+     logger.info(f"Imported {file_path}")
+ except Exception as e:
+     logger.error(f"Failed to import {file_path}: {e}")
+     raise
+ finally:
+     if cursor: cursor.close()
+     if conn: conn.close()`,
        'sql_ddl.sql', '已读取 4.2 KB，识别 student_info / student_score 两张数据表。',
        `CREATE TABLE student_info (
    id          SERIAL PRIMARY KEY,
    student_no  VARCHAR(20) UNIQUE NOT NULL,
    name        VARCHAR(50) NOT NULL,
    department  VARCHAR(50), ...
);
CREATE TABLE student_score (
    id          SERIAL PRIMARY KEY,
    student_no  VARCHAR(20) NOT NULL,
    course_name VARCHAR(80) NOT NULL,
    score       NUMERIC(5,2), ...
);`,
        'config.yaml', '生成数据库连接池、日志和导入参数配置，共 22 行。',
        `database:
  host: localhost  port: 5432
  dbname: student_db  user: postgres
  pool_min: 2  pool_max: 10  connect_timeout: 10
logging:
  level: INFO  file: logs/import.log  max_size: 10MB  backup_count: 5
import:
  batch_size: 500  encoding: utf-8  skip_header: true`,
        'python import_sql.py --dry-run', '预演导入流程，验证文件路径与数据库可达性。',
        `[Dry Run] 不会实际写入数据
[CHECK] sql_ddl.sql .............. OK (4.2 KB, 2 tables)
[CHECK] sql_insert.sql ............ OK (3.1 MB, 2847 rows)
[CHECK] PostgreSQL @ localhost:5432 OK (v16.3)
[CHECK] target database student_db . EXISTS
[CHECK] disk space available ...... 12.4 GB
All 5 checks passed. Ready to import.`,
        'PostgreSQL 批量导入性能优化', '获取到 3 条权威结果，已用于优化导入策略。',
        [
          { title: 'PostgreSQL 官方文档 - COPY 命令', url: 'https://www.postgresql.org/docs/current/sql-copy.html', icon: '\u{1F310}', summary: 'COPY 比 INSERT 快 10-100 倍，推荐用于大批量导入。', contentExpanded: false, status: 'pending', content: 'COPY 命令在 PostgreSQL 表和文件之间移动数据。单事务批量执行，比逐条 INSERT 快 10-100 倍。支持 CSV / TEXT / BINARY 三种格式。\nHTTP 200 . 17.4 KB . 抓取耗时 412ms' },
          { title: 'PostgreSQL Wiki - Bulk Loading', url: 'https://wiki.postgresql.org/wiki/BulkLoading', icon: '\u{1F4C4}', summary: '导入前 DROP INDEX，导入后再 CREATE，可提速 30%。', contentExpanded: false, status: 'pending', content: '加速批量导入清单：1. 关闭 autocommit 包在单事务 2. 优先用 COPY 3. 导入前 DROP INDEX 后重建 4. 调高 maintenance_work_mem 5. 完成后 ANALYZE\n实测 100 万行从 14 分钟降至 38 秒。\nHTTP 200 . 8.9 KB . 抓取耗时 287ms' },
          { title: '大批量导入 PostgreSQL 最佳实践', url: 'https://example.com/pg-bulk-load', icon: '\u{1F310}', summary: '调整 work_mem / maintenance_work_mem 与 wal_level=minimal。', contentExpanded: false, status: 'pending', content: '推荐配置：shared_buffers=25%RAM, work_mem=64MB, maintenance_work_mem=1GB, wal_level=minimal, synchronous_commit=off。\n导入完成后请恢复安全配置。\nHTTP 200 . 6.2 KB . 抓取耗时 198ms' },
        ],
        'postgres.execute_query',
        '{"rows": [{"count": 2847}], "rowCount": 1, "duration_ms": 124}',
        'data_validator.check_integrity', '验证导入数据完整性：外键约束、唯一索引、行数匹配、NOT NULL 检查。',
        `{
  "status": "passed",
  "checks": {
    "row_count_match": {"passed":true,"expected":2847,"actual":2847},
    "foreign_key_integrity": {"passed":true,"violations":0},
    "unique_constraints": {"passed":true,"duplicates":0},
    "not_null_violations": {"passed":true},
    "data_type_validation": {"passed":true}
  },
  "summary": "All 5 integrity checks passed.",
  "duration_ms": 89
}`,
        '数据导入报告.docx', '已写出至默认工作目录。',
        `Generated: /outputs/数据导入报告.docx
Size: 28.4 KB
Sections: 概述 / 执行步骤 / 结果统计 / 表结构
Status: ok`),

    ],
  },

  // ================================================================
  // 场景2: 报告/文档/周报
  // ================================================================
  {
    keywords: ['报告', '周报', '日报', '月报', '总结', 'ppt', '演示', '文档', '会议纪要'],
    report: `<h2>📝 周报生成任务执行报告</h2>

<h3>一、执行摘要</h3>
<p>本次任务自动收集了过去 7 天的工作记录、Git 提交历史和会议纪要，整合生成了结构化的工作周报。周报涵盖"本周完成 / 下周计划 / 风险与问题"三大板块，并同步推送至团队 Slack 频道。</p>

<h3>二、数据收集</h3>
<table><tr><th>来源</th><th>文件数</th><th>关键信息</th></tr>
<tr><td>工作文档</td><td>4</td><td>5项已完成任务</td></tr>
<tr><td>Git 日志</td><td>6次提交</td><td>2 feat / 3 fix / 1 chore</td></tr>
<tr><td>会议纪要</td><td>1</td><td>Q3路线图 3项决议</td></tr></table>

<h3>三、周报内容概览</h3>
<ul>
<li><strong>本周完成</strong>：用户模块重构（代码-30%）、支付双通道联调（沙箱通过）、3个线上 bug 修复、1次需求评审</li>
<li><strong>下周计划</strong>：性能优化（首页<1.5s）、支付上线、技术分享</li>
<li><strong>风险提示</strong>：CDN升级依赖排期，移动端适配资源待确认</li>
</ul>

<h3>四、产出文件</h3>
<ul>
<li><code>周报_2026-W21.md</code> — Markdown 源文件</li>
<li><code>周报_2026-W21.docx</code> — Word 正式文档</li>
<li><code>周报_2026-W21.pdf</code> — PDF 分发版本</li>
</ul>

<blockquote>📌 周报已自动推送至 #team-weekly 频道，团队成员可即时查阅。</blockquote>`,
    blocks: (_i: string) => [
      think(bId(), '先收集最近的工作文档和会议记录，整理任务完成情况。', [
        {
          type: 'command', label: 'git log --since="7 days ago" --oneline --author="$(git config user.name)"',
          finalStatus: 'failed',
          result: `fatal: not a git repository (or any of the parent directories): .git

[ERROR] 当前目录不是 Git 仓库，无法通过 git log 获取提交历史。
→ 回退方案：使用基于文件时间戳的搜索来收集工作记录`,
        },
        {
          type: 'command', label: 'find . -name "*.md" -mtime -7 -type f | head -20',
          result: `./weekly/上周工作总结.md
./weekly/工作日志_2026-05-18.md
./tasks/任务跟踪.md
./meetings/会议纪要_2026-05-20.md
./meetings/需求评审_Q3路线图.md
./issues/已关闭Bug列表.md
./docs/技术方案_v2.md

共找到 7 个最近修改的文档`,
        },
        {
          type: 'file_read', label: '读取 任务跟踪.md',
          result: `# 任务跟踪
- [x] 用户模块重构 (完成于 05-18)
- [x] 支付接口联调   (完成于 05-19)
- [x] 修复 3 个线上bug (完成于 05-20)
- [ ] 性能优化专项   (进行中 60%)
- [ ] 技术分享准备   (未开始)

本周完成 3 项，推进中 2 项`,
        },
        {
          type: 'file_read', label: '读取 需求评审_Q3路线图.md',
          finalStatus: 'failed',
          result: `cat: ./meetings/需求评审_Q3路线图.md: No such file or directory

[ERROR] 文件不存在 —— 可能是文件名中包含特殊字符或文件已被移动。
  尝试：find . -iname "*Q3*" -type f
  → 查找到 ./meetings/Q3产品路线图-需求评审纪要.md

实际路径与搜索结果不一致，已修正文件引用。`,
        },
        {
          type: 'file_read', label: '读取 Q3产品路线图-需求评审纪要.md（修正后路径）',
          result: `# Q3 产品路线图需求评审纪要
时间：2026.05.20 14:00-16:00
参会人：产品团队 6人 + 技术团队 4人
议题：Q3 产品路线图规划
决议：
1. 优先推进用户增长模块（P0，6月启动）
2. 数据看板延迟到 Q4（P1）
3. 移动端适配 7 月启动（P2）
4. AI 助手功能进入技术预研阶段

遗留问题：
- 用户增长模块需要运营团队确认指标体系（DDL: 5/25）
- 移动端适配需要设计资源排期`,
        },
      ], 6.8, [
        { name: '上周工作总结.md', desc: '包含 5 项已完成工作的详细描述' },
        { name: '任务跟踪.md', desc: '含进度状态和完成日期，本周完成 3 项' },
        { name: 'Q3产品路线图-需求评审纪要.md', desc: 'Q3 路线图决议，4 项关键决策 + 2 项遗留问题' },
        { name: '已关闭Bug列表.md', desc: '线上 Bug 修复记录' },
      ], '需要将这些信息整合成一份结构化的周报文档。git 不可用的情况下，已通过文件搜索成功收集到全部信息。'),

      think(bId(), '基于收集的信息，我正在归纳要点并按模板组织内容。', [
        {
          type: 'web_search', label: '搜索 技术团队周报模板', target: 'technical weekly report template',
          searchResults: [
            { title: 'Google 工程周报实践', url: 'https://example.com/google-eng-weekly', icon: '\u{1F50D}', summary: '不记流水账，聚焦"本周解决了什么问题"，用数据说话。', contentExpanded: false, status: 'pending', content: '核心原则：\n1. 每一条目 = 动作 + 结果 + 影响\n2. 不超过 10 条，精华优先\n3. 风险和求助单独列出\nHTTP 200 . 3.1 KB . 抓取耗时 187ms' },
            { title: '字节跳动内部周报规范', url: 'https://example.com/bytedance-weekly', icon: '\u{1F4CB}', summary: '条目化 + 数据支撑 + OKR 对齐，每项标记进度百分比。', contentExpanded: false, status: 'pending', content: '结构：\n## 关键结果\n- [P0] xxx (80%)\n## 风险与阻塞\n- xxx 等待审批\nHTTP 200 . 4.7 KB . 抓取耗时 234ms' },
          ],
        },
        {
          type: 'command', label: 'stat -c "%Y %n" ./weekly/*.md | sort -rn | head -5',
          result: `1716360000 ./weekly/上周工作总结.md
1716273600 ./weekly/工作日志_2026-05-18.md
1716187200 ./weekly/周报模板.md

最近活跃文件按修改时间排序完成`,
        },
        {
          type: 'command', label: 'grep -c "\\- \\[x\\]" ./tasks/任务跟踪.md && grep -c "\\- \\[ \\]" ./tasks/任务跟踪.md',
          result: `已完成项：12
未完成项：5

任务完成率：70.6% (12/17)`,
        },
      ], 7.2, [
        { name: '本周完成', desc: '3 项功能/修复 + 1 次需求评审 + 8 个 PR Review' },
        { name: '下周计划', desc: '性能优化专项 / 技术分享 / 支付模块上线' },
        { name: '风险项', desc: 'CDN 升级依赖 / 移动端设计资源待排期' },
      ], '下面整理为正式周报文档。'),

      codeEdit(bId(), '周报_2026-W21.md', 'markdown',
        `# 2026年 第21周 工作周报

**汇报人**: Easton | **日期**: 2026.05.18 - 2026.05.22

---

## ✅ 本周完成

### 功能开发
- **用户模块重构** — 重构用户中心 API 层，代码量减少 30%，接口响应提升 40%
- **支付接口联调** — 完成支付宝 / 微信支付双通道对接，沙箱环境通过

### Bug 修复
- 修复登录超时后未自动刷新 Token 的问题（影响用户数 ~1200/日）
- 修复用户数据在并发写入时的写不一致（涉及 orders / users 双表事务）
- 修复 Safari 15.x 浏览器下 CSS Grid 布局导致的页面白屏兼容性问题

### 其他
- 参与 Q3 产品路线图需求评审，产出会议纪要（4 项决议 + 2 项遗留问题）
- 代码 Review 8 个 PR，累计 126 条评论，发现 3 个潜在问题
- 编写《支付模块对接规范》内部文档

---

## 📋 下周计划

- 🔴 **性能优化专项** — 首页首屏加载目标 < 1.5s（当前 2.8s）
- 🟡 支付模块正式环境上线（需通过安全审计）
- 🟢 技术分享：TypeScript 高级类型体操
- ⚪ AI 助手技术预研启动

---

## ⚠️ 风险与问题

- 性能优化依赖 CDN 升级，预计下周二完成（运维确认中）
- 移动端适配需要设计资源排期，已提需求给设计团队
- 支付模块安全审计排期可能与上线时间冲突`,
        5.2),

      webSearch(bId(), '技术周报 OKR 对齐写法范本', [
        {
          title: 'Google 工程周报实践',
          url: 'https://example.com/google-eng-weekly',
          icon: '\u{1F50D}', summary: '不记流水账，聚焦"本周解决了什么问题"，用数据说话。',
          contentExpanded: false, status: 'pending',
          content: `核心原则：
1. 每一条目 = 动作 + 结果 + 影响
2. 不超过 10 条，精华优先
3. 风险和求助单独列出
4. 量化指标：响应时间、影响用户数、代码行数变化
HTTP 200 . 3.1 KB . 抓取耗时 187ms`,
        },
        {
          title: 'Notion 周报自动化模板',
          url: 'https://example.com/notion-weekly',
          icon: '\u{1F4DD}', summary: '通过 Notion API 自动汇总任务卡片生成周报初稿。',
          contentExpanded: false, status: 'pending',
          content: `工作流：
  Git commits -> Notion tasks -> 周报草稿 -> 人工润色
节省每周约 30 分钟撰写时间。
关键字段：完成时间 / 所属 OKR / 影响范围 / 量化指标
HTTP 200 . 5.9 KB . 抓取耗时 234ms`,
        },
      ], 2.4),

      think(bId(), '周报内容已就绪，现在通过 Slack 发送通知并生成最终文件。', [
        {
          type: 'mcp_execute', label: 'slack.send_message (初次发送)', target: 'slack.send_message',
          finalStatus: 'failed',
          result: `{
  "ok": false,
  "error": "rate_limited",
  "retry_after": 3,
  "error_detail": "Too many requests in channel #team-weekly. Please wait 3 seconds before retrying."
}

[ERROR] Slack API 限流 —— 频道 #team-weekly 短时间内请求过多。
→ 将在 3 秒后自动重试...`,
        },
        {
          type: 'mcp_execute', label: 'slack.send_message (重试成功)', target: 'slack.send_message',
          result: `{
  "ok": true,
  "channel": "C05K8M3N2PQ",
  "ts": "1716360000.000200",
  "message": {
    "type": "message",
    "user": "U04A1B2C3D4",
    "text": ":memo: *2026年第21周工作周报已生成*\n本周完成 3 项功能/Bug修复 | 下周聚焦性能优化\n:link: 查看详情：https://wiki.internal/weekly/2026-W21",
    "permalink": "https://team.slack.com/archives/C05K8M3N2PQ/p1716360000000200"
  },
  "notification_status": "delivered_to_15_members"
}`,
        },
      ], 3.8, [
        { name: 'Slack 通知', desc: '已发送到 #team-weekly，15 位成员收到通知' },
        { name: 'Wiki 链接', desc: '周报已关联到内部 Wiki' },
      ], 'Slack 通知已发送（初次遇限流已自动重试成功），开始生成最终文件。'),

      htmlRender(bId(), '周报预览',
        `<!DOCTYPE html><html><head><meta charset="utf-8"><style>
body{font-family:system-ui;max-width:720px;margin:40px auto;background:#f8fafc}
h1{color:#0f172a;font-size:24px;border-bottom:2px solid #3b82f6;padding-bottom:12px}
h2{color:#334155;font-size:18px;margin:24px 0 12px}
.section{background:#fff;border:1px solid #e2e8f0;border-radius:8px;padding:20px;margin:12px 0}
.badge{display:inline-block;padding:2px 8px;border-radius:4px;font-size:12px;margin-right:6px}
.p0{background:#fef2f2;color:#dc2626}.p1{background:#fef9c3;color:#ca8a04}
.item{padding:8px 0;border-bottom:1px solid #f1f5f9;font-size:14px}
.risk{background:#fef2f2;border-left:3px solid #ef4444;padding:12px;margin:8px 0;font-size:13px}
</style></head><body>
<h1>:memo: 2026年 第21周 工作周报</h1>
<p style="color:#64748b">汇报人: Easton | 2026.05.18 - 2026.05.22</p>
<div class="section"><h2>:white_check_mark: 本周完成 (3项)</h2>
<div class="item"><span class="badge p0">P0</span> 用户模块重构 (代码量 -30%)</div>
<div class="item"><span class="badge p0">P0</span> 支付接口联调 (双通道通过)</div>
<div class="item"><span class="badge p1">P1</span> 修复 3 个线上 Bug</div>
</div>
<div class="section"><h2>:calendar: 下周计划</h2>
<div class="item"><span class="badge p0">P0</span> 性能优化专项</div>
<div class="item"><span class="badge p0">P0</span> 支付模块上线</div>
<div class="item"><span class="badge p1">P1</span> 技术分享准备</div>
</div>
<div class="section"><h2>:warning: 风险项</h2>
<div class="risk">CDN 升级依赖运维排期 (预计周二)</div>
<div class="risk">移动端设计资源待确认</div>
</div>
</body></html>`,
        '周报 HTML 预览已渲染，交互式查看本周工作概览',
        2.5),

      fileQuery(bId(), [
        { title: '周报_2026-W21.md', url: '/workspace/周报_2026-W21.md' },
        { title: '周报_2026-W21.docx', url: '/workspace/周报_2026-W21.docx' },
        { title: 'slack_notification_log.txt', url: '/workspace/.logs/slack_notification_log.txt' },
        { title: 'Q3产品路线图-需求评审纪要.md', url: '/workspace/meetings/Q3产品路线图-需求评审纪要.md' },
      ], 1.5),

      complex(bId(), '最终复合处理：导出多格式并归档', [
        {
          type: 'command', label: 'pandoc 周报_2026-W21.md -o 周报_2026-W21.docx --reference-doc=template.docx',
          detail: '初次转换因模板文件缺失失败，触发回退方案。',
          finalStatus: 'failed',
          result: `pandoc: template.docx: openBinaryFile: does not exist (No such file or directory)

[ERROR] 模板文件 template.docx 不存在。
→ 回退方案：不带模板参数直接转换`,
        },
        {
          type: 'command', label: 'pandoc 周报_2026-W21.md -o 周报_2026-W21.docx',
          detail: '回退至无模板模式后成功转换为 DOCX（52 KB，487 词）。',
          result: `✓ 转换成功: 周报_2026-W21.docx (52 KB)
  Input format:  markdown
  Output format: docx
  Word count: 487`,
        },
        {
          type: 'command', label: 'pandoc 周报_2026-W21.md -o 周报_2026-W21.pdf --pdf-engine=weasyprint',
          detail: '生成 PDF 版本（128 KB，3 页），嵌入 Noto Sans CJK SC 中文字体。',
          result: `✓ 转换成功: 周报_2026-W21.pdf (128 KB)
  Pages: 3
  Fonts embedded: Noto Sans CJK SC`,
        },
        {
          type: 'mcp_execute', label: 'wiki.upload_page', target: 'wiki.upload_page',
          detail: '上传周报到内部 Wiki，附带 PDF 和补充材料附件。',
          result: `{
  "page_id": "weekly-2026-W21",
  "url": "https://wiki.internal/weekly/2026-W21",
  "version": 1,
  "attachments": ["周报_2026-W21.pdf", "Q3产品路线图-需求评审纪要.md"],
  "updated_at": "2026-05-22T15:10:42Z"
}`,
        },
      ], 8.6),

      genFiles(bId(), [
        { name: '周报_2026-W21.md', type: 'md', content: 'markdown://周报.md' },
        { name: '周报_2026-W21.docx', type: 'docx', content: 'docx://周报.docx' },
        { name: '周报_2026-W21.pdf', type: 'pdf', content: 'pdf://周报.pdf' },
        { name: 'slack_notification_log.txt', type: 'txt', content: 'text://通知日志.txt' },
      ], 2.5),

      allComplexBlock(bId(),
        '报告生成阶段：脚本增强 → Git 日志分析 → 模板配置 → 生成执行 → 格式规范检索 → 消息推送 → 完整性校验 → 成果输出',
        24.8,
        'weekly_report.py', '新增 auto-slack-notify 函数，支持多频道分发和失败重试（+24 / -3 行）。',
        `@@ -45,3 +45,27 @@
  def generate_report(week: str) -> Report:
      data = collect_weekly_data(week)
-     save_markdown(render(data), f"weekly_{week}.md")
-     print("Done.")
+     md_path = save_markdown(render(data), f"weekly_{week}.md")
+     docx_path = convert_to_docx(md_path)
+     pdf_path = convert_to_pdf(docx_path)
+     logger.info(f"Generated: {md_path}, {docx_path}, {pdf_path}")
+     notify_slack(data, week)
+     return Report(md=md_path, docx=docx_path, pdf=pdf_path)
+
+ def notify_slack(data: ReportData, week: str) -> None:
+     for channel in SLACK_CHANNELS:
+         for attempt in range(MAX_RETRIES):
+             try:
+                 client.chat_postMessage(
+                     channel=channel,
+                     blocks=format_slack_blocks(data, week)
+                 )
+                 break
+             except SlackApiError as e:
+                 if attempt == MAX_RETRIES - 1: raise
+                 time.sleep(2 ** attempt)`,
        'git_log.txt', '已读取 6.8 KB，提取本周 23 次提交记录与变更摘要。',
        `commit a3f8c21 - feat: 新增周报自动导出 PDF 功能  (+156, -12)
commit b7d12e9 - fix: 修复中文字体渲染问题  (+8, -3)
commit c2a8901 - refactor: 重构数据收集模块，支持多源聚合  (+42, -28)
commit d4e67b3 - docs: 更新 README 与部署说明  (+15, -2)
... (共 23 次提交)`,
        'report_config.yaml', '生成周报模板配置：板块结构、样式参数、Slack 渠道映射。',
        `template:
  title: "周报 {week}"
  sections:
    - name: 本周完成  emoji: "✅"
    - name: 下周计划  emoji: "📋"
    - name: 风险与问题  emoji: "⚠️"
slack:
  channels: ["#team-weekly", "#pm-sync"]
  notify_on_publish: true
output:
  formats: [md, docx, pdf]`,
        'python generate_weekly_report.py --week W21', '执行本周周报生成，处理收集、渲染、推送全流程。',
        `[COLLECT] 工作记录 ....... 7 days, 42 entries
[COLLECT] Git commits ...... 23 commits, 3 authors
[COLLECT] 会议纪要 ......... 5 meetings
[RENDER] Markdown ......... 2.8 KB
[CONVERT] → DOCX ........... 45.2 KB
[CONVERT] → PDF ............ 128.6 KB
[NOTIFY] → #team-weekly ... OK
[NOTIFY] → #pm-sync ........ OK
[DONE] 周报生成完毕 ✓`,
        '周报撰写最佳实践与模板', '获取到 3 条参考资源，已用于优化板块结构与措辞。',
        [
          { title: '如何写出高效的周报 - 阿里技术', url: 'https://example.com/efficient-weekly-report', icon: '\u{1F4DD}', summary: '使用"结果 + 数据"结构替代流水账，每项不超过 3 行。', contentExpanded: false, status: 'pending', content: '高效周报三原则：① 用结果说话而非过程描述 ② 每条不超过 3 行 ③ 风险项必须附带建议方案。\n模板：本周完成 / 下周计划 / 风险与问题。\nHTTP 200 . 5.2 KB . 抓取耗时 198ms' },
          { title: '企业周报自动化最佳实践', url: 'https://example.com/automated-reporting', icon: '\u{1F4CA}', summary: '从 Jira / Git / 日历自动聚合数据，减少手动收集 80% 时间。', contentExpanded: false, status: 'pending', content: '数据源自动聚合方案：Jira API 拉取任务状态、Git 特定分支日志、Google Calendar 提取会议摘要。\n推荐用 Pandoc 实现 md→docx→pdf 多格式转换。\nHTTP 200 . 7.8 KB . 抓取耗时 312ms' },
          { title: 'Slack Block Kit 消息格式化指南', url: 'https://api.slack.com/block-kit', icon: '\u{1F4AC}', summary: '使用 Section + Divider + Context 组合构建清晰的周报摘要卡片。', contentExpanded: false, status: 'pending', content: 'Block Kit 推荐布局:\n- Header: 周报标题\n- Section: 本周亮点（最多 3 条）\n- Divider\n- Context: 生成时间 & 文件链接\nHTTP 200 . 4.1 KB . 抓取耗时 156ms' },
        ],
        'slack.send_message',
        '{"ok": true, "channel": "#team-weekly", "message_ts": "1716300000.000200", "text": "周报已发布"}',
        'report_validator.check_completeness', '校验周报完整性：板块覆盖、字数和文件格式。',
        `{
  "status": "passed",
  "checks": {
    "sections_present": {"passed":true,"required":["本周完成","下周计划","风险与问题"],"found":3},
    "word_count": {"passed":true,"min":300,"actual":1256},
    "git_commits_included": {"passed":true,"count":23},
    "slack_delivered": {"passed":true,"channels":["#team-weekly","#pm-sync"]},
    "output_formats": {"passed":true,"formats":["md","docx","pdf"]}
  },
  "summary": "All 5 checks passed. 周报完整度 100%.",
  "duration_ms": 112
}`,
        '周报_2026-W21.docx', '已写出至默认工作目录。',
        `Generated: /outputs/weekly_reports/周报_2026-W21.docx
Size: 45.2 KB
Sections: 本周完成 / 下周计划 / 风险与问题
Status: ok`),

    ],
  },

  // ================================================================
  // 场景3: 代码开发
  // ================================================================
  {
    keywords: ['代码', '编程', '脚本', 'python', 'typescript', '开发', '函数', '接口', 'api', '组件'],
    report: `<h2>⚙️ 用户服务模块开发报告</h2>

<h3>一、开发概要</h3>
<p>基于现有的 FastAPI 项目骨架，成功实现了一个完整的用户服务模块，包含注册、登录、JWT 认证等核心功能。所有代码已通过类型检查、单元测试和 API 联调验证。</p>

<h3>二、技术方案</h3>
<table><tr><th>层级</th><th>文件</th><th>技术选型</th></tr>
<tr><td>数据模型</td><td>models/user.py</td><td>SQLAlchemy ORM</td></tr>
<tr><td>业务服务</td><td>services/user_service.py</td><td>Pydantic v2 + JWT</td></tr>
<tr><td>路由层</td><td>routes/user_routes.py</td><td>FastAPI APIRouter</td></tr>
<tr><td>测试</td><td>tests/test_user_service.py</td><td>pytest 4个用例</td></tr></table>

<h3>三、质量指标</h3>
<ul>
<li>TypeScript / Python 类型检查：✅ 零错误</li>
<li>单元测试：✅ 4/4 全部通过（覆盖率 87.4%）</li>
<li>API 端点：✅ 3个端点全部可用（Swagger UI 可交互测试）</li>
<li>安全审计：⚠️ 建议将 SECRET_KEY 迁移至环境变量，hash 算法升级为 bcrypt</li>
</ul>

<h3>四、安全建议</h3>
<ul>
<li>🔴 <strong>高优先级</strong>：密码哈希从 SHA256 升级为 bcrypt（防彩虹表攻击）</li>
<li>🟡 <strong>中优先级</strong>：JWT secret 迁移至环境变量或密钥管理服务</li>
<li>🟢 <strong>低优先级</strong>：添加 refresh token 轮换机制，access_token 过期缩短至 15 分钟</li>
</ul>

<blockquote>✅ 代码已推送至 feature/user-service 分支，可提交 PR 进行 Code Review。</blockquote>`,
    blocks: (_i: string) => [
      think(bId(), '先分析需求，规划模块结构和数据流。', [
        {
          type: 'web_search', label: '搜索 FastAPI + SQLAlchemy 最佳实践', target: 'FastAPI SQLAlchemy project structure best practices',
          searchResults: [
            { title: 'FastAPI 项目结构最佳实践', url: 'https://fastapi.tiangolo.com/tutorial/bigger-applications/', icon: '\u{1F4D7}', summary: '按功能模块分层：models / services / routes / schemas', contentExpanded: false, status: 'pending', content: '推荐分层结构：\n  api/ - 路由层\n  crud/ - 数据操作层\n  models/ - ORM 模型\n  schemas/ - Pydantic 模型\n  core/ - 配置/安全\nHTTP 200 . 8.7 KB . 抓取耗时 234ms' },
            { title: 'Repository Pattern 在 SQLAlchemy 中的应用', url: 'https://example.com/repo-pattern', icon: '\u{1F3D7}', summary: '数据访问层抽象，便于单元测试和替换数据源。', contentExpanded: false, status: 'pending', content: '核心接口：\n  class BaseRepo:\n    get_by_id() / create() / update() / delete()\n通过依赖注入切换实现。\nHTTP 200 . 5.4 KB . 抓取耗时 189ms' },
          ],
        },
        {
          type: 'command', label: 'tree -L 2 ./src',
          result: `./src
├── models/
│   ├── user.py
│   └── __init__.py
├── services/
│   └── __init__.py
├── routes/
│   └── __init__.py
├── schemas/
│   └── __init__.py
└── main.py

3 directories, 5 files —— 项目骨架已搭建，待填充业务逻辑`,
        },
        {
          type: 'file_read', label: '读取 requirements.txt',
          result: `fastapi==0.111.0
uvicorn[standard]==0.30.1
sqlalchemy==2.0.30
pydantic==2.7.1
redis==5.0.6
python-jose[cryptography]==3.3.0
passlib[bcrypt]==1.7.4
pytest==8.2.1
httpx==0.27.0`,
        },
      ], 4.5),

      think(bId(), '已了解项目结构。这是一个 FastAPI 后端项目，需要新增用户服务模块。先读取现有模型和路由。', [
        {
          type: 'file_read', label: '读取 models/user.py',
          result: `from sqlalchemy import Column, String, Integer, DateTime
from sqlalchemy.ext.declarative import declarative_base

Base = declarative_base()

class User(Base):
    __tablename__ = 'users'
    id = Column(Integer, primary_key=True)
    username = Column(String(50), unique=True, nullable=False)
    email = Column(String(120), unique=True)
    password_hash = Column(String(256), nullable=True)  # 待实现哈希
    created_at = Column(DateTime)

# TODO: 缺少 is_active / last_login 字段
# TODO: 缺少 password_hash 的加密逻辑`,
        },
        {
          type: 'file_read', label: '读取 main.py 路由注册',
          result: `from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

app = FastAPI(title="AIPCowork API", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.get("/health")
def health():
    return {"status": "ok", "version": "1.0.0"}

# TODO: 注册 user 路由
# TODO: 添加全局异常处理`,
        },
      ], 3.8, [
        { name: 'User 模型', desc: '已定义基础字段，缺少密码哈希和 is_active / last_login' },
        { name: '路由入口', desc: 'main.py 中 CORS 已配置，路由未注册' },
        { name: '依赖清单', desc: 'python-jose / passlib / pytest 已就绪' },
      ], '接下来创建完整的用户服务模块。'),

      codeEdit(bId(), 'services/user_service.py', 'python',
        `"""用户服务模块"""
from datetime import datetime, timedelta
from typing import Optional
from passlib.context import CryptContext
import jwt

from sqlalchemy.orm import Session
from pydantic import BaseModel, EmailStr, field_validator
from models.user import User

SECRET_KEY = "your-secret-key-change-in-prod"
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 30

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

class UserCreate(BaseModel):
    username: str
    email: EmailStr
    password: str

    @field_validator('password')
    @classmethod
    def password_strength(cls, v: str) -> str:
        if len(v) < 8:
            raise ValueError('密码至少 8 位')
        if not any(c.isupper() for c in v):
            raise ValueError('密码需包含大写字母')
        if not any(c.isdigit() for c in v):
            raise ValueError('密码需包含数字')
        return v

class UserResponse(BaseModel):
    id: int
    username: str
    email: str
    is_active: bool
    created_at: datetime

    class Config:
        from_attributes = True

class UserService:
    def __init__(self, db: Session):
        self.db = db

    def create_user(self, data: UserCreate) -> UserResponse:
        user = User(
            username=data.username,
            email=data.email,
            password_hash=pwd_context.hash(data.password),
            is_active=True,
            created_at=datetime.utcnow()
        )
        self.db.add(user)
        self.db.commit()
        self.db.refresh(user)
        return UserResponse.model_validate(user)

    def authenticate(self, username: str, password: str) -> Optional[str]:
        user = self.db.query(User).filter_by(username=username).first()
        if not user or not pwd_context.verify(password, user.password_hash or ''):
            return None
        return self._generate_token(user)

    def _generate_token(self, user: User) -> str:
        payload = {
            "sub": str(user.id),
            "username": user.username,
            "exp": datetime.utcnow() + timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
        }
        return jwt.encode(payload, SECRET_KEY, algorithm=ALGORITHM)`,
        6.0),

      think(bId(), '服务层完成，现在补充路由层并运行测试。', [
        {
          type: 'code_edit', label: '编辑 routes/user_routes.py', target: 'user_routes.py',
          result: `from fastapi import APIRouter, Depends, HTTPException
from services.user_service import UserService, UserCreate

router = APIRouter(prefix="/users", tags=["users"])

@router.post("/register", response_model=UserResponse)
def register(data: UserCreate, svc: UserService = Depends()):
    try:
        return svc.create_user(data)
    except IntegrityError:
        raise HTTPException(409, "用户名或邮箱已存在")

@router.post("/login")
def login(username: str, password: str, svc: UserService = Depends()):
    token = svc.authenticate(username, password)
    if not token:
        raise HTTPException(401, "用户名或密码错误")
    return {"access_token": token, "token_type": "bearer"}

@router.get("/me")
def me(current_user: User = Depends(get_current_user)):
    return UserResponse.model_validate(current_user)`,
        },
        {
          type: 'command', label: 'npm install',
          finalStatus: 'failed',
          result: `npm ERR! code ETIMEDOUT
npm ERR! syscall connect
npm ERR! errno ETIMEDOUT
npm ERR! network request to https://registry.npmjs.org/fastapi/-/fastapi-0.111.0.tgz failed
npm ERR! network This is a problem related to network connectivity.

[ERROR] npm 默认源连接超时 —— 可能被防火墙阻断或 registry.npmjs.org 不可达。
→ 重试方案：切换到国内镜像源`,
        },
        {
          type: 'command', label: 'pip install -r requirements.txt -i https://mirrors.aliyun.com/pypi/simple/ --trusted-host mirrors.aliyun.com',
          result: `Looking in indexes: https://mirrors.aliyun.com/pypi/simple/
Collecting fastapi==0.111.0
  Downloading https://mirrors.aliyun.com/pypi/packages/.../fastapi-0.111.0-py3-none-any.whl (92 kB)
Collecting uvicorn[standard]==0.30.1
  ...
Successfully installed fastapi-0.111.0 uvicorn-0.30.1 sqlalchemy-2.0.30 pydantic-2.7.1 redis-5.0.6 python-jose-3.3.0 passlib-1.7.4 pytest-8.2.1 httpx-0.27.0

✓ 所有依赖安装成功 (使用阿里云镜像源)`,
        },
        {
          type: 'command', label: 'pytest tests/test_user_service.py -v',
          finalStatus: 'failed',
          result: `tests/test_user_service.py::test_create_user PASSED          [ 20%]
tests/test_user_service.py::test_duplicate_username PASSED    [ 40%]
tests/test_user_service.py::test_authenticate PASSED          [ 60%]
tests/test_user_service.py::test_invalid_password PASSED      [ 80%]
tests/test_user_service.py::test_password_validation FAILED   [100%]

================================== FAILURES ==================================
____________________ test_password_validation ____________________
    def test_password_validation():
        """密码强度校验：应拒绝纯小写密码"""
>       with pytest.raises(ValueError, match="大写字母"):
E       Failed: DID NOT RAISE ValueError
E       assert not any(c.isupper() for c in 'password123')
tests/test_user_service.py:48: Failed
======= 4 passed, 1 failed in 0.87s =======`,
        },
        {
          type: 'code_edit', label: '修复 test_password_validation 测试用例', target: 'tests/test_user_service.py',
          result: `@@ -46,7 +46,7 @@
  def test_password_validation():
      """密码强度校验：应拒绝纯小写密码"""
-     with pytest.raises(ValueError, match="大写字母"):
+     with pytest.raises(ValueError, match="大写字母|uppercase"):
          UserCreate(username="test2", email="t2@test.com", password="password123")

  → 修复：测试数据从 'password123' 改为无大写字母的密码以触发校验`,
        },
        {
          type: 'command', label: 'pytest tests/test_user_service.py -v (修复后重跑)',
          result: `tests/test_user_service.py::test_create_user PASSED          [ 20%]
tests/test_user_service.py::test_duplicate_username PASSED    [ 40%]
tests/test_user_service.py::test_authenticate PASSED          [ 60%]
tests/test_user_service.py::test_invalid_password PASSED      [ 80%]
tests/test_user_service.py::test_password_validation PASSED   [100%]

======= 5 passed in 0.64s =======
✓ 全部测试通过`,
        },
        {
          type: 'command', label: 'uvicorn main:app --port 8000 --reload & sleep 2 && curl -s http://localhost:8000/health',
          result: `INFO:     Uvicorn running on http://127.0.0.1:8000 (Press CTRL+C to quit)
INFO:     Started reloader process [28741]
{"status":"ok","version":"1.0.0"}

✓ API 服务启动成功，健康检查通过`,
        },
      ], 12.5),

      webSearch(bId(), 'FastAPI 生产部署 + JWT 安全最佳实践', [
        {
          title: 'FastAPI + Gunicorn + Uvicorn 生产部署',
          url: 'https://fastapi.tiangolo.com/deployment/',
          icon: '\u{1F680}', summary: '使用 gunicorn -k uvicorn.workers.UvicornWorker 管理多进程。',
          contentExpanded: false, status: 'pending',
          content: `推荐配置:
  gunicorn main:app -w 4 -k uvicorn.workers.UvicornWorker --bind 0.0.0.0:8000
  preload_app 可减少内存占用
  max_requests=10000 防止内存泄漏
HTTP 200 . 7.1 KB . 抓取耗时 198ms`,
        },
        {
          title: 'JWT 最佳安全实践 (OWASP 2025)',
          url: 'https://cheatsheetseries.owasp.org/cheatsheets/JSON_Web_Token_Cheat_Sheet.html',
          icon: '\u{1F512}', summary: '使用 RS256 替代 HS256、设置短过期时间、实现 refresh token 轮换。',
          contentExpanded: false, status: 'pending',
          content: `核心建议:
  1. access_token 过期 <= 15 分钟
  2. refresh_token 过期 <= 7 天
  3. 禁止在 URL 中传递 token
  4. 使用 httponly cookie 存储
  5. 实现 token 黑名单 (Redis)
HTTP 200 . 11.3 KB . 抓取耗时 245ms`,
        },
        {
          title: 'SQLAlchemy 2.0 异步支持与连接池优化',
          url: 'https://docs.sqlalchemy.org/en/20/orm/extensions/asyncio.html',
          icon: '\u{1F40D}', summary: '使用 asyncpg 驱动 + AsyncSession 实现异步数据库操作。',
          contentExpanded: false, status: 'pending',
          content: `异步配置:
  engine = create_async_engine("postgresql+asyncpg://...")
  pool_size=20, max_overflow=10
  pool_pre_ping=True 防止连接失效
HTTP 200 . 6.5 KB . 抓取耗时 212ms`,
        },
      ], 3.0),

      mcpExec(bId(), 'git.commit_and_push',
        '{"files":["services/user_service.py","routes/user_routes.py","tests/test_user_service.py","models/user.py"],"message":"feat: 新增用户服务模块（注册/登录/JWT鉴权）","branch":"feature/user-service"}',
        `{
  "status": "success",
  "commit": {
    "hash": "9d8f7e6a2b1c3d4e5f6a7b8c9d0e1f2a3b4c5d6e",
    "message": "feat: 新增用户服务模块（注册/登录/JWT鉴权）",
    "author": "Easton <easton@team.dev>",
    "timestamp": "2026-05-22T15:45:30+08:00"
  },
  "branch": {
    "name": "feature/user-service",
    "base": "main",
    "url": "https://gitee.com/eastonii/aipcowork/tree/feature/user-service"
  },
  "diff_stats": {
    "files_changed": 4,
    "insertions": 387,
    "deletions": 23,
    "files": [
      {"path": "services/user_service.py", "status": "A", "lines": "+156/-0"},
      {"path": "routes/user_routes.py", "status": "A", "lines": "+67/-0"},
      {"path": "tests/test_user_service.py", "status": "A", "lines": "+112/-0"},
      {"path": "models/user.py", "status": "M", "lines": "+52/-23"}
    ]
  },
  "diff_preview": {
    "services/user_service.py": "@@ -0,0 +1,156 @@\\n+\\"\\"\\"用户服务模块\\"\\"\\"\\n+from datetime import datetime, timedelta\\n+from typing import Optional\\n+from passlib.context import CryptContext\\n+import jwt\\n+...\\n+class UserService:\\n+    def __init__(self, db: Session):\\n+        self.db = db\\n+    def create_user(self, data: UserCreate) -> UserResponse:\\n+        ...\\n+    def authenticate(self, username: str, password: str) -> Optional[str]:\\n+        ...",
    "routes/user_routes.py": "@@ -0,0 +1,67 @@\\n+router = APIRouter(prefix=\\"/users\\", tags=[\\"users\\"])\\n+@router.post(\\"/register\\")\\n+def register(data: UserCreate, svc: UserService = Depends()):\\n+    ...\\n+@router.post(\\"/login\\")\\n+def login(username, password, svc):\\n+    ...",
    "tests/test_user_service.py": "@@ -0,0 +1,112 @@\\n+def test_create_user():\\n+    ...\\n+def test_authenticate():\\n+    ...",
    "models/user.py": "@@ -8,7 +10,11 @@\\n class User(Base):\\n+    password_hash = Column(String(256))\\n+    is_active = Column(Boolean, default=True)\\n+    last_login = Column(DateTime)"
  },
  "ci_status": "pending",
  "reviewers_suggested": ["@tech-leads"]
}`,
        2.6),

      htmlRender(bId(), 'API 文档预览',
        `<!DOCTYPE html><html><head><meta charset="utf-8"><style>
body{font-family:system-ui;margin:30px;background:#f8fafc}
h2{color:#1e293b}.endpoint{background:#fff;border:1px solid #e2e8f0;border-radius:8px;padding:16px;margin:12px 0}
.method{display:inline-block;padding:3px 8px;border-radius:4px;font-weight:700;font-size:12px;margin-right:8px}
.post{background:#dbeafe;color:#1d4ed8}.get{background:#dcfce7;color:#16a34a}
.path{font-family:monospace;font-size:14px}.desc{color:#64748b;margin-top:6px;font-size:13px}
</style></head><body>
<h2>User Service API</h2>
<div class="endpoint"><span class="method post">POST</span><span class="path">/users/register</span><div class="desc">用户注册 - 需提供 username / email / password，bcrypt 加密存储</div></div>
<div class="endpoint"><span class="method post">POST</span><span class="path">/users/login</span><div class="desc">用户登录 - 返回 JWT access_token (30min 过期)</div></div>
<div class="endpoint"><span class="method get">GET</span><span class="path">/users/me</span><div class="desc">获取当前用户信息 - 需 Bearer token</div></div>
<div class="endpoint"><span class="method get">GET</span><span class="path">/docs</span><div class="desc">Swagger UI 交互文档</div></div>
<div class="endpoint"><span class="method get">GET</span><span class="path">/health</span><div class="desc">健康检查</div></div>
</body></html>`,
        'API 文档已通过 Swagger UI 渲染，5 个端点全部可用',
        2.8),

      genFiles(bId(), [
        { name: 'services/user_service.py', type: 'py', content: 'code://user_service.py' },
        { name: 'routes/user_routes.py', type: 'py', content: 'code://user_routes.py' },
        { name: 'tests/test_user_service.py', type: 'py', content: 'code://test.py' },
        { name: 'API_README.md', type: 'md', content: 'markdown://API文档.md' },
      ], 2.4),

      allComplexBlock(bId(),
        '代码实现阶段：异步抽象化 → 依赖分析 → 环境配置 → 依赖安装 → 最佳实践检索 → 数据库迁移 → 代码审查 → 文档产出',
        28.3,
        'src/services/user_service.py', '新增 AsyncSession 和 async/await 支持，抽取连接管理为独立上下文管理器（+32 / -8 行）。',
        `@@ -12,6 +12,38 @@
- from sqlalchemy.orm import Session
+ from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine
+ from contextlib import asynccontextmanager

+ engine = create_async_engine(DATABASE_URL, pool_size=10)
+
+ @asynccontextmanager
+ async def get_session() -> AsyncSession:
+     async with AsyncSession(engine) as session:
+         try:
+             yield session
+             await session.commit()
+         except Exception:
+             await session.rollback()
+             raise
+         finally:
+             await session.close()

- def get_user(db: Session, user_id: int):
+ async def get_user(user_id: int):
+     async with get_session() as db:
          return db.query(User).filter(User.id == user_id).first()`,
        'pyproject.toml', '已读取项目依赖配置，识别 fastapi、sqlalchemy、asyncpg 等 8 项核心依赖。',
        `[project]
name = "user-management-api"
version = "0.1.0"
requires-python = ">=3.11"
dependencies = [
    "fastapi>=0.111.0", "uvicorn>=0.30.0",
    "sqlalchemy[asyncio]>=2.0.30", "asyncpg>=0.29.0",
    "pydantic>=2.7.0", "python-jose>=3.3.0",
    "passlib[bcrypt]>=1.7.4",
]
[project.optional-dependencies]
dev = ["pytest>=8.2", "httpx>=0.27", "pytest-asyncio>=0.23"]`,
        '.env.example', '生成环境变量模板：数据库连接串、JWT 密钥、Redis 地址和应用参数。',
        `DATABASE_URL=postgresql+asyncpg://user:pass@localhost:5432/user_mgmt
JWT_SECRET_KEY=change-me-to-a-random-string-256bit
JWT_ALGORITHM=HS256
ACCESS_TOKEN_EXPIRE_MINUTES=15
REDIS_URL=redis://localhost:6379/0
APP_ENV=development
APP_PORT=8080`,
        'uv pip install -r requirements.txt', '安装项目运行时依赖，共 24 个包。',
        `✓ Created virtual environment at: .venv/
✓ Installed 24 packages in 3.2s
  fastapi==0.111.0
  asyncpg==0.29.0
  python-jose[cryptography]==3.3.0
  passlib[bcrypt]==1.7.4
  pytest==8.2.1
  ... (共 24 个包，无冲突)
所有运行时依赖就绪 ✓`,
        'FastAPI async SQLAlchemy 最佳实践', '获取到 3 条参考资源，已用于指导异步 DB 层设计。',
        [
          { title: 'SQLAlchemy 2.0 异步迁移指南', url: 'https://docs.sqlalchemy.org/en/20/orm/extensions/asyncio.html', icon: '\u{1F4D8}', summary: 'AsyncSession + select() 新 API，配合 asyncpg 驱动实现非阻塞 ORM。', contentExpanded: false, status: 'pending', content: '迁移 Checklist:\ncreate_async_engine() 替代 create_engine()\nasync with AsyncSession() as session:\nselect(User).where(...) 新语法\nGreenlet spawn 选项可简化 async→sync 桥接\nHTTP 200 . 12.4 KB . 抓取耗时 267ms' },
          { title: 'FastAPI 依赖注入与异步处理', url: 'https://fastapi.tiangolo.com/tutorial/dependencies/', icon: '\u{1F510}', summary: '使用 Depends() 注入 async 数据库会话，避免全局状态。', contentExpanded: false, status: 'pending', content: '推荐模式:\nasync def get_db():\n    async with AsyncSessionLocal() as session:\n        yield session\n\n路径依赖注入:\n@app.get("/users")\nasync def list_users(db: AsyncSession = Depends(get_db)):\n    ...\nHTTP 200 . 15.7 KB . 抓取耗时 298ms' },
          { title: 'Python 异步编程陷阱与解决方案', url: 'https://example.com/async-python-pitfalls', icon: '\u{1F9E9}', summary: '避免在 async 函数中混用同步阻塞调用，使用 asyncio.to_thread() 隔离。', contentExpanded: false, status: 'pending', content: '常见陷阱:\n1. 在 async def 中调用 time.sleep() → 使用 await asyncio.sleep()\n2. 同步 I/O 未用 run_in_executor 包裹\n3. 忘记 await 导致协程未执行\n4. 在 __init__ 中调用 async 函数\nHTTP 200 . 6.5 KB . 抓取耗时 234ms' },
        ],
        'database.migrate',
        '{"status": "completed", "migrations_applied": 2, "tables": ["users", "sessions"], "duration_ms": 187}',
        'code_review.check_quality', '代码审查：类型安全、异步正确性、安全性和测试覆盖率。',
        `{
  "status": "passed",
  "checks": {
    "type_safety": {"passed":true,"mypy_errors":0},
    "async_correctness": {"passed":true,"blocking_calls":0},
    "security_scan": {"passed":true,"vulnerabilities":0},
    "test_coverage": {"passed":true,"coverage_pct":88},
    "linter": {"passed":true,"ruff_errors":0}
  },
  "summary": "All 5 checks passed. Code ready for review.",
  "duration_ms": 234
}`,
        'API_README.md', '已写出至默认工作目录。',
        `Generated: /outputs/api_docs/API_README.md
Size: 8.6 KB
Sections: 概述 / 认证 / 端点列表 / 请求示例 / 错误码
Status: ok`),

    ],
  },

  // ================================================================
  // 场景4: 数据分析
  // ================================================================
  {
    keywords: ['数据', '分析', '图表', '可视化', '统计', 'excel', 'csv', 'json', '清洗'],
    report: `<h2>📈 2026 Q1 销售分析报告</h2>

<h3>一、分析概览</h3>
<p>基于 48,229 条有效销售记录，关联 1,200 条商品信息和 856 条客户反馈，从时间趋势、区域分布、渠道效率、产品表现和客户情感五个维度进行了综合分析。</p>

<h3>二、核心指标</h3>
<table><tr><th>指标</th><th>数值</th><th>同比</th></tr>
<tr><td>总营收</td><td>¥4,275,300</td><td>↑ 22.1%</td></tr>
<tr><td>订单量</td><td>48,229</td><td>↑ 18.5%</td></tr>
<tr><td>平均客单价</td><td>¥1,423</td><td>↑ 3.2%</td></tr>
<tr><td>总利润</td><td>¥1,282,590</td><td>↑ 19.8%</td></tr>
<tr><td>毛利率</td><td>30.0%</td><td>↓ 1.5%</td></tr></table>

<h3>三、关键发现</h3>
<ul>
<li><strong>电子配件</strong>贡献 44.2% 营收，毛利率 30%，是核心利润来源</li>
<li><strong>线上渠道</strong>营收占比 67.6%，客单价（¥1,567）显著高于线下（¥892）</li>
<li><strong>华东地区</strong>贡献 31% 营收，线上渗透率 78%，是全国标杆市场</li>
<li><strong>无线耳机</strong>用户正面情感得分最高（4.2/5），复购意愿强</li>
<li>⚠️ <strong>手机壳</strong>品类毛利率仅 18% 且持续下降，建议调整定价策略</li>
</ul>

<h3>四、战略建议</h3>
<ul>
<li>加大华东线上营销投放，复制成功经验至华中地区</li>
<li>智能穿戴品类增速 35%，建议增加 SKU 和营销资源倾斜</li>
<li>线下门店引入扫码购/自助结算，提升转化率（当前仅 8%）</li>
<li>针对低毛利品类与供应商重新谈判采购价，目标毛利率提升至 25%+</li>
</ul>

<blockquote>📊 完整分析报告和交互式数据看板已生成，详见产出文件。</blockquote>`,
    blocks: (_i: string) => [
      think(bId(), '先检查数据文件结构和内容，确定分析维度。', [
        {
          type: 'command', label: 'ls -lh ./data/',
          result: `total 24M
-rw-r--r-- 1 user staff  8.2M  sales_2026Q1.csv
-rw-r--r-- 1 user staff  4.7M  products.json
-rw-r--r-- 1 user staff  1.1M  customer_feedback.xlsx`,
        },
        {
          type: 'command', label: 'python -c "import pandas; df=pandas.read_csv(\'./data/sales_2026Q1.csv\', encoding=\'utf-8\'); print(df.head())"',
          finalStatus: 'failed',
          result: `Traceback (most recent call last):
  File "<string>", line 1, in <module>
  File "pandas/_libs/parsers.pyx", line 1123, in pandas._libs.parsers.TextReader._setup_parser_source
UnicodeDecodeError: 'utf-8' codec can't decode byte 0xb4 in position 892: invalid start byte

[ERROR] CSV 文件编码不是 UTF-8 —— 可能为 GBK / GB2312 编码。
→ 重试方案：使用 chardet 自动检测编码`,
        },
        {
          type: 'command', label: 'python -c "import chardet; raw=open(\'./data/sales_2026Q1.csv\',\'rb\').read(10000); print(chardet.detect(raw))"',
          result: `{'encoding': 'GB2312', 'confidence': 0.99, 'language': 'Chinese'}

检测结果：GB2312 编码，置信度 99%`,
        },
        {
          type: 'command', label: 'python -c "import pandas; df=pandas.read_csv(\'./data/sales_2026Q1.csv\', encoding=\'gb2312\'); print(df.columns.tolist()); print(f\'行数: {len(df)}\')"',
          result: `['date', 'product_id', 'product_name', 'category', 'quantity', 'unit_price', 'total_amount', 'region', 'channel']
行数: 48,291

✓ 编码问题已解决（GB2312），共 48,291 行 × 9 列`,
        },
      ], 6.5),

      think(bId(), '3个数据源已确认：销售数据(48K行)、商品信息、客户反馈。先做数据清洗和合并。', [
        {
          type: 'command', label: 'python scripts/clean_sales.py --input ./data/sales_2026Q1.csv --encoding gb2312',
          result: `数据清洗完成:
  总行数: 48,291
  空值行: 12 (0.02%) - date/product_id 字段，已用前向填充
  异常值: 3 (unit_price <= 0) - 已剔除 (product_id: P045/P089/P201)
  重复行: 47 (0.1%) - 已去重
  有效行: 48,229
  耗时: 2.34s`,
        },
        {
          type: 'command', label: 'python scripts/merge_data.py --sales cleaned_sales.csv --products products.json --feedback customer_feedback.xlsx',
          finalStatus: 'failed',
          result: `合并 sales + products + feedback...

⚠ 警告：检测到列名冲突！
  - products.json 和 customer_feedback.xlsx 均包含 'product_name' 列
  - products.json 和 customer_feedback.xlsx 均包含 'category' 列
  - 已自动添加后缀：product_name_products / product_name_feedback
  - 已自动添加后缀：category_products / category_feedback

建议手动检查合并结果中的列名是否正确对应。

  JOIN 完成: 48,229 sales × 1,200 products × 856 feedback
  统一数据集列: date, product_name, category, quantity, amount, region, channel, cost, profit, sentiment, score`,
        },
        {
          type: 'command', label: 'python -c "import pandas; df=pandas.read_csv(\'merged.csv\'); print(df.describe().round(2))"',
          result: `       quantity     amount      profit       score
count  48229.00   48229.00   48229.00   48229.00
mean      56.32    1423.67     423.15       3.87
std       34.19    1187.42     356.72       0.94
min        1.00      29.90    -102.00       1.00
25%       28.00     567.25     172.50       3.00
50%       48.00    1183.00     352.00       4.00
75%       78.00    2049.75     612.25       5.00
max      999.00    9999.00    3200.00       5.00

统计概览：平均客单价 ¥1,423.67，单品利润 ¥423.15，评分均值 3.87/5`,
        },
      ], 10.5, [
        { name: '数据清洗', desc: '处理空值/异常值/重复，有效率 99.87%' },
        { name: '多源关联', desc: '销售+商品+反馈三表 JOIN，检测到 2 处列名冲突已自动处理' },
        { name: '统计概览', desc: '平均客单价 ¥1,423.67，毛利 29.7%，评分 3.87' },
      ], '数据就绪，开始多维分析。'),

      codeEdit(bId(), 'analyze_sales.py', 'python',
        `"""销售数据分析脚本"""
import pandas as pd
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
import numpy as np

plt.rcParams['font.sans-serif'] = ['Noto Sans CJK SC', 'SimHei']
plt.rcParams['axes.unicode_minus'] = False

df = pd.read_csv('merged.csv')
df['date'] = pd.to_datetime(df['date'])

# 1. 月度销售趋势
monthly = df.groupby(df['date'].dt.to_period('M')).agg(
    revenue=('amount', 'sum'),
    orders=('quantity', 'sum'),
    profit=('profit', 'sum'),
    avg_score=('score', 'mean')
).reset_index()

# 2. 区域 × 品类交叉分析
pivot = df.pivot_table(
    values='amount', index='region', columns='category',
    aggfunc='sum', margins=True, margins_name='合计'
)

# 3. 渠道效率对比
channel = df.groupby('channel').agg(
    revenue=('amount', 'sum'),
    avg_order=('amount', 'mean'),
    order_cnt=('quantity', 'count'),
    profit_margin=('profit', lambda x: (x.sum() / df.loc[x.index, 'amount'].sum() * 100))
).round(2)

# 4. 客户评分与利润相关性
corr = df[['score', 'profit', 'amount', 'quantity']].corr()

print("=== 月度趋势 ===")
print(monthly.to_string())
print("\\n=== 区域×品类 ===")
print(pivot.to_string())
print("\\n=== 渠道对比 ===")
print(channel.to_string())
print("\\n=== 相关性矩阵 ===")
print(corr.round(3).to_string())`,
        5.5),

      mcpExec(bId(), 'python.execute_script',
        '{"script":"analyze_sales.py","timeout":30}',
        `{
  "status": "completed",
  "execution_time_sec": 4.82,
  "memory_peak_mb": 128.7,
  "monthly_trend": {
    "2026-01": {"revenue": 1284500, "orders": 15892, "profit": 385350, "avg_score": 3.82},
    "2026-02": {"revenue": 1423000, "orders": 16341, "profit": 426900, "avg_score": 3.89},
    "2026-03": {"revenue": 1567800, "orders": 15996, "profit": 470340, "avg_score": 3.91}
  },
  "quarter_summary": {
    "total_revenue": 4275300,
    "total_orders": 48229,
    "total_profit": 1282590,
    "profit_margin_pct": 30.0,
    "mom_growth_revenue": [null, 10.8, 10.2],
    "mom_growth_orders": [null, 2.8, -2.1]
  },
  "region_category": {
    "华东": {"电子配件": 756000, "智能穿戴": 448000, "电脑外设": 312000, "生活电器": 198500, "其他": 145200},
    "华南": {"电子配件": 425000, "智能穿戴": 302400, "电脑外设": 198000, "生活电器": 245600, "其他": 112800},
    "华北": {"电子配件": 389000, "智能穿戴": 235200, "电脑外设": 156000, "生活电器": 121300, "其他": 98700},
    "西南": {"电子配件": 198000, "智能穿戴": 89600, "电脑外设": 72000, "生活电器": 98700, "其他": 65200},
    "华中": {"电子配件": 122000, "智能穿戴": 44800, "电脑外设": 42000, "生活电器": 56700, "其他": 28900}
  },
  "channel_stats": {
    "线上": {
      "revenue": 2890000, "share_pct": 67.6,
      "avg_order": 1567.80, "order_cnt": 1842,
      "profit_margin": 32.1, "top_category": "智能穿戴"
    },
    "线下": {
      "revenue": 1385300, "share_pct": 32.4,
      "avg_order": 892.40, "order_cnt": 1553,
      "profit_margin": 25.7, "top_category": "电子配件"
    }
  },
  "correlation_matrix": {
    "score_vs_profit": 0.423,
    "score_vs_amount": 0.387,
    "amount_vs_profit": 0.912,
    "quantity_vs_profit": -0.156
  },
  "top_products_by_revenue": [
    {"rank": 1, "name": "无线耳机", "revenue": 523400, "share": 12.2, "margin": 34.5},
    {"rank": 2, "name": "智能手表", "revenue": 412800, "share": 9.7, "margin": 41.2},
    {"rank": 3, "name": "充电宝", "revenue": 345600, "share": 8.1, "margin": 22.8},
    {"rank": 4, "name": "蓝牙音箱", "revenue": 298700, "share": 7.0, "margin": 28.4},
    {"rank": 5, "name": "数据线", "revenue": 234500, "share": 5.5, "margin": 45.6}
  ],
  "anomalies_detected": [
    {"type": "price_outlier", "product": "P045", "unit_price": 0, "action": "removed"},
    {"type": "price_outlier", "product": "P089", "unit_price": -5.99, "action": "removed"},
    {"type": "price_outlier", "product": "P201", "unit_price": 0.01, "action": "removed"},
    {"type": "quantity_spike", "date": "2026-02-14", "quantity": 999, "product": "无线耳机", "note": "情人节促销"},
    {"type": "negative_profit", "count": 87, "pct": 0.18, "note": "主要集中在促销时段"}
  ],
  "insights": [
    "线上渠道贡献 67.6% 营收，且利润率高出线下 6.4 个百分点 —— 建议加大线上投放",
    "西南地区营收仅占 4.7%，但环比增长率 15.8% 为各区域最高 —— 潜力市场",
    "评分与利润相关系数 r=0.423，高评分产品毛利率平均高出 8.2 个百分点",
    "3月订单量环比下降 2.1%，但客单价上升 12.5% —— 存在消费升级趋势",
    "87 条订单出现负利润（占 0.18%），全部发生在 2月促销季 —— 需审查促销策略"
  ]
}`,
        5.0),

      webSearch(bId(), '2026 Q1 消费电子行业趋势报告', [
        {
          title: '2026 Q1 消费电子市场简报',
          url: 'https://example.com/ce-market-q1',
          icon: '\u{1F4C8}', summary: 'TWS 耳机出货量同比增长 22%，智能穿戴设备增长 35%。',
          contentExpanded: false, status: 'pending',
          content: `无线耳机仍是最大品类，均价 ¥299 竞争激烈。
AI 功能成为差异化关键，语音助手集成占比 45%。
华东 + 华南贡献全国 68% 消费电子线上营收。
HTTP 200 . 9.8 KB . 抓取耗时 312ms`,
        },
        {
          title: '华东 vs 华南消费习惯差异分析',
          url: 'https://example.com/region-compare',
          icon: '\u{1F30D}', summary: '华东线上占比 78%，华南线下占比 45%，渠道策略需区别对待。',
          contentExpanded: false, status: 'pending',
          content: `华东消费者偏好高客单价产品 (avg ¥1,867 vs 全国 ¥1,423)
华南消费者对促销敏感度更高，优惠券使用率 62%
西南地区 Z 世代占比 47%，智能穿戴渗透率增长最快
HTTP 200 . 7.2 KB . 抓取耗时 278ms`,
        },
        {
          title: '2026 电商渠道效率白皮书',
          url: 'https://example.com/channel-efficiency',
          icon: '\u{1F4CA}', summary: '直播电商渠道转化率 8.7%，远超传统货架电商 2.1%。',
          contentExpanded: false, status: 'pending',
          content: `各渠道对比：
  直播电商：转化率 8.7%，退货率 12.3%
  短视频电商：转化率 5.2%，退货率 9.8%
  传统电商：转化率 2.1%，退货率 6.5%
  线下门店：转化率 18.4%，退货率 3.2%
HTTP 200 . 5.6 KB . 抓取耗时 267ms`,
        },
      ], 3.5),

      htmlRender(bId(), 'Q1 销售数据看板',
        `<!DOCTYPE html><html><head><meta charset="utf-8"><style>
body{font-family:system-ui;margin:30px;background:#f1f5f9}
h2{color:#1e293b;margin:0 0 16px}.kpi-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:16px;margin-bottom:24px}
.kpi{background:#fff;border-radius:12px;padding:20px;box-shadow:0 1px 3px rgba(0,0,0,.06)}
.kpi .label{font-size:12px;color:#94a3b8;text-transform:uppercase;letter-spacing:.5px}
.kpi .val{font-size:28px;font-weight:700;color:#1e293b;margin:8px 0}
.kpi .change{font-size:13px}.up{color:#16a34a}.down{color:#dc2626}
table{width:100%;border-collapse:collapse;background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,.06)}
th{background:#f8fafc;padding:12px;text-align:left;font-size:12px;color:#64748b;font-weight:600}
td{padding:12px;font-size:13px;border-top:1px solid #f1f5f9}
</style></head><body>
<h2>2026 Q1 销售概览</h2>
<div class="kpi-grid">
<div class="kpi"><div class="label">总营收</div><div class="val">&yen;4,275,300</div><div class="change up">&uarr; 22.1%</div></div>
<div class="kpi"><div class="label">订单量</div><div class="val">48,229</div><div class="change up">&uarr; 18.5%</div></div>
<div class="kpi"><div class="label">总利润</div><div class="val">&yen;1,282,590</div><div class="change up">&uarr; 19.8%</div></div>
<div class="kpi"><div class="label">平均客单</div><div class="val">&yen;1,423</div><div class="change up">&uarr; 3.2%</div></div>
</div>
<table><tr><th>品类</th><th>营收</th><th>占比</th><th>利润</th><th>利润率</th></tr>
<tr><td>电子配件</td><td>&yen;1,890,000</td><td>44.2%</td><td>&yen;567,000</td><td>30.0%</td></tr>
<tr><td>智能穿戴</td><td>&yen;1,120,000</td><td>26.2%</td><td>&yen;448,000</td><td>40.0%</td></tr>
<tr><td>电脑外设</td><td>&yen;780,000</td><td>18.2%</td><td>&yen;195,000</td><td>25.0%</td></tr>
<tr><td>生活电器</td><td>&yen;320,500</td><td>7.5%</td><td>&yen;52,800</td><td>16.5%</td></tr>
<tr><td>其他</td><td>&yen;164,800</td><td>3.9%</td><td>&yen;19,790</td><td>12.0%</td></tr></table>
</body></html>`,
        '已生成交互式数据看板，含4个核心KPI和品类销售明细',
        2.6),

      fileQuery(bId(), [
        { title: 'analyze_sales.py', url: '/workspace/analyze_sales.py' },
        { title: 'Q1销售分析报告.xlsx', url: '/workspace/Q1销售分析报告.xlsx' },
        { title: 'merged.csv (清洗合并后)', url: '/workspace/data/merged.csv' },
        { title: 'execution_analysis.log', url: '/workspace/.logs/execution_analysis.log' },
      ], 1.5),

      complex(bId(), '最终复合处理：异常回溯与报告生成', [
        {
          type: 'command', label: 'python scripts/anomaly_backtrace.py --input merged.csv --anomalies anomalies.json',
          detail: '回溯 87 条异常订单，识别 3 类成因：促销折扣过高、定价错误、异常采购量。',
          result: `异常订单回溯完成:
  负利润订单: 87 条 (0.18%)
    - 67 条来自 2月14日 情人节闪购 (折扣率 > 40%)
    - 12 条来自 3月8日 女神节促销
    - 8 条为系统定价错误 (已修复)
  数量异常: 1 条 (2月14日 无线耳机 x999)
  建议: 促销活动设置最低毛利阈值 (建议 >= 5%)`,
        },
        {
          type: 'file_read', label: '检查报告模板完整性', target: 'templates/report_v2.html',
          detail: '查找自定义报告模板，因文件缺失触发回退策略。',
          finalStatus: 'failed',
          result: `cat: templates/report_v2.html: No such file or directory

[ERROR] 报告模板文件不存在。
→ 回退方案：使用默认模板 templates/report_default.html`,
        },
        {
          type: 'mcp_execute', label: 'report.generate (回退模板)', target: 'report.generate',
          detail: '回退至默认模板后成功生成 4 页分析报告，含 4 张图表。',
          result: `{
  "status": "success",
  "template_used": "report_default",
  "output": "/workspace/Q1销售分析报告.xlsx",
  "pages": 4,
  "charts_included": ["月度趋势折线图", "区域×品类热力图", "渠道对比柱状图", "利润率分布箱线图"],
  "file_size_kb": 312,
  "generated_at": "2026-05-22T16:18:45Z"
}`,
        },
      ], 7.8),

      genFiles(bId(), [
        { name: 'analyze_sales.py', type: 'py', content: 'code://分析脚本.py' },
        { name: 'Q1销售分析报告.xlsx', type: 'xlsx', content: 'xlsx://分析报告.xlsx' },
        { name: '销售数据看板.html', type: 'html', content: 'html://数据看板.html' },
        { name: 'anomaly_report.txt', type: 'txt', content: 'text://异常订单回溯.txt' },
      ], 2.0),

      allComplexBlock(bId(),
        '数据分析阶段：脚本增强 → 原始数据评估 → 参数配置 → 分析执行 → 可视化规范检索 → 数据查询 → 统计校验 → 报告产出',
        25.6,
        'analyze_sales.py', '新增异常检测模块与多维度交叉分析，支持 IQR 和 Z-Score 双算法（+46 / -11 行）。',
        `@@ -28,6 +28,52 @@
  def analyze(df: pd.DataFrame) -> dict:
      return {
          "summary": df.describe().to_dict(),
+         "by_region": df.groupby("region").agg({"amount": ["sum","mean","count"]}).to_dict(),
+         "monthly_trend": df.set_index("date").resample("M")["amount"].sum().to_dict(),
      }
+
+ def detect_anomalies(df: pd.DataFrame, method: str = "iqr") -> pd.DataFrame:
+     if method == "iqr":
+         Q1 = df["amount"].quantile(0.25)
+         Q3 = df["amount"].quantile(0.75)
+         IQR = Q3 - Q1
+         lower = Q1 - 1.5 * IQR
+         upper = Q3 + 1.5 * IQR
+         anomalies = df[(df["amount"] < lower) | (df["amount"] > upper)]
+     elif method == "zscore":
+         from scipy import stats
+         z = stats.zscore(df["amount"].dropna())
+         anomalies = df.iloc[np.abs(z) > 3]
+     anomalies["reason"] = anomalies.apply(
+         lambda r: f"金额 {r['amount']:,.0f} 超出正常范围", axis=1
+     )
+     return anomalies`,
        'Q1_raw_data.csv', '已读取 2.4 MB，含 12,840 条销售记录，覆盖 6 个区域、18 个产品类别。',
        `date,region,category,product,amount,quantity,customer_id
2026-01-03,华东,电子产品,MacBook Pro 14,16999.00,1,C00123
2026-01-05,华南,家居,人体工学椅,2499.00,2,C00567
2026-01-08,华北,办公,打印机墨盒,389.00,10,C00891
... (共 12,840 行)
列数: 7 | 缺失值: 0 | 日期范围: 2026-01-01 ~ 2026-03-31`,
        'analysis_config.yaml', '生成分析参数配置：统计方法、可视化参数和输出格式。',
        `analysis:
  period: Q1-2026
  anomaly_detection: iqr
  anomaly_threshold: 1.5
  segment_by: [region, category, month]
visualization:
  chart_style: seaborn-v0_8-darkgrid
  color_palette: viridis
  dpi: 150
output:
  formats: [xlsx, html, txt]
  include_raw_data: false`,
        'python analyze_sales.py --quarter Q1', '执行 Q1 销售数据分析，输出统计摘要和可视化图表。',
        `[LOAD] Q1_raw_data.csv ......... 12,840 rows × 7 cols
[ANALYZE] 统计摘要 ................ done
[ANALYZE] 区域维度 ................ 6 regions
[ANALYZE] 月度趋势 ................ 3 months
[ANALYZE] 类别分布 ................ 18 categories
[DETECT] 异常值 (IQR) ............ 37 outliers found
[RENDER] 销售数据看板.html ........ 684 KB
[EXPORT] Q1销售分析报告.xlsx ....... 128 KB
[DONE] 分析完成 ✓`,
        '数据可视化最佳实践与图表选型', '获取到 3 条参考资源，已用于指导报告图表设计。',
        [
          { title: 'Seaborn 数据可视化完全指南', url: 'https://seaborn.pydata.org/tutorial.html', icon: '\u{1F4CA}', summary: '热力图适合相关性分析，箱线图适合异常检测，折线图适合趋势展示。', contentExpanded: false, status: 'pending', content: '图表选择指南:\n- 趋势: 折线图 (lineplot)\n- 分布: 箱线图 (boxplot) / 直方图 (histplot)\n- 关系: 散点图 (scatterplot) / 热力图 (heatmap)\n- 组成: 堆叠柱状图 / 饼图\nHTTP 200 . 18.3 KB . 抓取耗时 345ms' },
          { title: '数据分析报告撰写规范', url: 'https://example.com/analytics-report-standards', icon: '\u{1F4C4}', summary: '报告应包含摘要、方法、发现和建议四部分，每页图表附带一句话结论。', contentExpanded: false, status: 'pending', content: '报告结构:\n1. 摘要 (Executive Summary) — 1 页\n2. 方法 (Methodology) — 数据源/清洗/分析方法\n3. 发现 (Findings) — 按维度展开，图表+结论\n4. 建议 (Recommendations) — 可执行的业务行动\nHTTP 200 . 5.7 KB . 抓取耗时 201ms' },
          { title: '异常检测算法对比：IQR vs Z-Score vs Isolation Forest', url: 'https://example.com/anomaly-detection-comparison', icon: '\u{1F9EA}', summary: 'IQR 适合中等偏态数据，Z-Score 适合正态分布，Isolation Forest 适合高维数据。', contentExpanded: false, status: 'pending', content: '算法对比:\nIQR: 非参数方法，不受极端值影响，适合有偏数据\nZ-Score: 假设正态分布，对偏态数据敏感\nIsolation Forest: 基于树模型，适合高维/非线性异常\n建议: 优先用 IQR 做初步筛选，再人工复核\nHTTP 200 . 8.1 KB . 抓取耗时 276ms' },
        ],
        'database.execute_query',
        '{"rows": [{"total_revenue": 48762350.80, "total_orders": 12840, "avg_order_value": 3797.69}], "rowCount": 1, "duration_ms": 98}',
        'stats_validator.check_distribution', '统计校验：正态性检验、方差齐性和异常一致性。',
        `{
  "status": "passed",
  "checks": {
    "normality_shapiro": {"passed":false,"p_value":0.003,"note":"数据偏态，已选用 IQR 检测"},
    "variance_homogeneity": {"passed":true,"groups":6,"bartlett_p":0.42},
    "anomaly_consistency": {"passed":true,"iqr_found":37,"zscore_found":34,"overlap":31},
    "sample_size": {"passed":true,"min_per_group":840},
    "date_completeness": {"passed":true,"days_missing":0}
  },
  "summary": "4 of 5 checks passed. 1 warning (non-normal distribution, handled).",
  "duration_ms": 156
}`,
        'Q1销售分析报告.xlsx', '已写出至默认工作目录。',
        `Generated: /outputs/reports/Q1销售分析报告.xlsx
Size: 128 KB
Sheets: 摘要 / 区域分析 / 月度趋势 / 类别排名 / 异常清单
Status: ok`),

    ],
  },

  // ================================================================
  // 场景5: 复合多步骤执行（演示 complex_thinking + 全部步骤类型）
  // ================================================================
  {
    keywords: ['复合', '多步骤', '综合', '全栈', 'api服务', '搭建', '部署', '搭建服务', '一体化'],
    report: `<h2>🚀 全栈 API 服务搭建任务执行报告</h2>

<h3>一、任务概要</h3>
<p>本次任务完整搭建了一个"用户管理 API 服务"，涵盖需求分析、环境检查、代码编写、文件生成、网页搜索资料、方法执行部署和端到端验证。整个过程通过<strong>复合思考（complex_thinking）</strong>编排多步骤并发执行，大幅提升效率。</p>

<h3>二、执行流程</h3>
<table><tr><th>阶段</th><th>操作类型</th><th>说明</th><th>结果</th></tr>
<tr><td>复合分析</td><td>🔍 搜索 → 📂 文件查看 → 💻 命令执行</td><td>技术调研 + 环境检查</td><td>✅ 8/8 步骤完成</td></tr>
<tr><td>代码实现</td><td>📝 代码编辑</td><td>编写 3 个核心模块</td><td>✅ 156 行代码</td></tr>
<tr><td>联网参考</td><td>🌐 网页搜索</td><td>查阅 3 篇文档</td><td>✅ 全部抓取</td></tr>
<tr><td>方法执行</td><td>⚙️ MCP 方法调用</td><td>部署 + 测试 + 推送</td><td>✅ all green</td></tr>
<tr><td>文件产出</td><td>📦 文件生成</td><td>生成 5 个交付文件</td><td>✅ 全部就绪</td></tr>
<tr><td>渲染展示</td><td>🖥 HTML 渲染</td><td>API 文档预览</td><td>✅ 交互正常</td></tr></table>

<h3>三、关键发现</h3>
<ul>
<li><strong>bcrypt 哈希</strong>：安全性优于 SHA256，已纳入实现方案</li>
<li><strong>JWT 过期策略</strong>：access_token 15min + refresh_token 7d 是最佳实践组合</li>
<li><strong>异步依赖注入</strong>：FastDepends 库可优雅处理 async 依赖，减少样板代码 40%</li>
<li><strong>复合思考编排</strong>：8 个步骤中有 1 个失败（\`user_roles\` 迁移表缺失），已自动修正并回退重试成功</li>
</ul>

<h3>四、产出文件</h3>
<ul>
<li><code>src/models/user.py</code> — SQLAlchemy 用户模型（含 bcrypt 哈希）</li>
<li><code>src/services/auth_service.py</code> — JWT 认证服务（access + refresh token）</li>
<li><code>src/routes/user_routes.py</code> — 7 个 RESTful API 端点</li>
<li><code>tests/test_user_api.py</code> — 12 个测试用例，覆盖率 91%</li>
<li><code>DEPLOY.md</code> — 部署文档和环境变量清单</li>
</ul>

<blockquote>✅ 服务已部署至 8080 端口，Swagger UI 可通过 http://localhost:8080/docs 访问。</blockquote>`,
    blocks: (_i: string) => [
      // ===================== 复合思考块：需求调研 + 环境检查 =====================
      complex(bId(), '需求分析阶段：技术选型调研 + 项目环境检查 + 现有代码评估', [
        {
          type: 'web_search',
          label: '搜索 FastAPI + JWT 认证最佳实践',
          target: 'FastAPI JWT authentication best practices 2026',
          detail: '获取 2 篇权威文档：OAuth2 JWT 实操 + SQLAlchemy 异步迁移。',
          searchResults: [
            { title: 'FastAPI Security - OAuth2 with JWT', url: 'https://fastapi.tiangolo.com/tutorial/security/oauth2-jwt/', icon: '\u{1F510}', summary: '推荐使用 python-jose 库 + bcrypt 哈希，access_token 建议 15 分钟过期。', contentExpanded: false, status: 'pending', content: '核心流程:\n  OAuth2PasswordBearer → 提取 token\n  jwt.decode() → 验证签名\n  Depends(get_current_user) → 注入用户\nHTTP 200 . 12.4 KB . 抓取耗时 312ms' },
            { title: 'SQLAlchemy 2.0 异步迁移指南', url: 'https://docs.sqlalchemy.org/en/20/orm/extensions/asyncio.html', icon: '\u{1F4D8}', summary: 'AsyncSession + select() 新 API，配合 asyncpg 驱动。', contentExpanded: false, status: 'pending', content: '迁移 Checklist:\n  create_async_engine() 替代 create_engine()\n  async with AsyncSession() as session:\n  select(User).where(...) 新语法\nHTTP 200 . 8.7 KB . 抓取耗时 267ms' },
          ],
        },
        {
          type: 'file_read',
          label: '查看现有项目结构和依赖',
          target: 'pyproject.toml',
          detail: '已读取依赖配置，识别 fastapi、sqlalchemy 等核心项，标注缺失的 JWT 相关包。',
          result: `[project]
name = "user-management-api"
version = "0.1.0"
requires-python = ">=3.11"
dependencies = [
    "fastapi>=0.111.0",
    "uvicorn[standard]>=0.30.0",
    "sqlalchemy>=2.0.30",
    "asyncpg>=0.29.0",
    "pydantic>=2.7.0",
]

[project.optional-dependencies]
dev = ["pytest>=8.2", "httpx>=0.27", "pytest-asyncio>=0.23"]

# TODO: 需要补充 python-jose / passlib 用于 JWT 认证`,
        },
        {
          type: 'command',
          label: '检查 Python 环境和数据库连通性',
          detail: '验证 Python 3.12.3、PostgreSQL 16.3 和 Redis 7.2.4 均正常运行。',
          result: `Python 3.12.3 (main, Apr  8 2026, 10:00:00) [GCC 13.2.0]
pip 24.1.2

✓ psql -U postgres -h localhost -c "SELECT 1" → 1
  PostgreSQL 16.3 running on port 5432
✓ redis-cli ping → PONG
  Redis 7.2.4 running on port 6379

⚠ 注意：asyncpg 未安装，将在依赖安装阶段处理`,
        },
        {
          type: 'command',
          label: '安装缺失依赖 (asyncpg + python-jose + passlib)',
          detail: '全局 pip 被 Homebrew 保护拦截，需切换至虚拟环境方案。',
          finalStatus: 'failed',
          result: `error: externally-managed-environment

This environment is externally managed by Homebrew.
To install Python packages system-wide, use brew or create a venv.

[ERROR] 系统保护阻止了全局 pip install。
→ 修正方案：创建虚拟环境并在其中安装`,
        },
        {
          type: 'command',
          label: 'uv venv && uv pip install 依赖 (回退方案)',
          detail: '创建虚拟环境后成功安装 24 个包，耗时 3.2 秒。',
          result: `✓ Created virtual environment at: .venv/
✓ Installed 24 packages in 3.2s
  fastapi==0.111.0
  asyncpg==0.29.0
  python-jose[cryptography]==3.3.0
  passlib[bcrypt]==1.7.4
  pytest==8.2.1
  httpx==0.27.0

所有运行时依赖就绪 ✓`,
        },
        {
          type: 'code_edit',
          label: '创建 src/models/user.py 用户数据模型',
          target: 'src/models/user.py',
          detail: '新建 SQLAlchemy 模型，含 bcrypt 密码哈希和 8 个字段。',
          result: `from sqlalchemy import Column, String, Integer, Boolean, DateTime
from sqlalchemy.orm import declarative_base
from datetime import datetime, timezone
from passlib.context import CryptContext

Base = declarative_base()
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

class User(Base):
    __tablename__ = 'users'
    id = Column(Integer, primary_key=True, autoincrement=True)
    username = Column(String(50), unique=True, nullable=False, index=True)
    email = Column(String(120), unique=True, nullable=False)
    hashed_password = Column(String(128), nullable=False)
    is_active = Column(Boolean, default=True)
    is_superuser = Column(Boolean, default=False)
    created_at = Column(DateTime, default=datetime.now(timezone.utc))
    last_login = Column(DateTime, nullable=True)

    def verify_password(self, plain: str) -> bool:
        return pwd_context.verify(plain, self.hashed_password)

    @staticmethod
    def hash_password(plain: str) -> str:
        return pwd_context.hash(plain)`,
        },
        {
          type: 'mcp_execute',
          label: '数据库迁移：创建 users 表',
          target: 'database.migrate',
          detail: '执行 DDL 迁移脚本，创建 8 列 1 索引的 users 表。',
          result: `{
  "status": "completed",
  "operation": "create_table",
  "table": "users",
  "columns_created": 8,
  "indexes_created": 1,
  "sql_preview": "CREATE TABLE users (id SERIAL PRIMARY KEY, username VARCHAR(50) UNIQUE NOT NULL, email VARCHAR(120) UNIQUE NOT NULL, hashed_password VARCHAR(128) NOT NULL, is_active BOOLEAN DEFAULT TRUE, is_superuser BOOLEAN DEFAULT FALSE, created_at TIMESTAMP WITH TIME ZONE, last_login TIMESTAMP WITH TIME ZONE)",
  "migration_file": "migrations/001_create_users_table.sql",
  "duration_ms": 187
}`,
        },
        {
          type: 'file_gen',
          label: '生成 .env.example 环境变量模板',
          detail: '生成含数据库、JWT、Redis 和应用 4 个配置段的环境变量模板。',
          result: `# ===== 数据库 =====
DATABASE_URL=postgresql+asyncpg://postgres:password@localhost:5432/user_mgmt
DATABASE_POOL_SIZE=10

# ===== JWT =====
JWT_SECRET_KEY=change-me-to-a-random-string
JWT_ALGORITHM=HS256
ACCESS_TOKEN_EXPIRE_MINUTES=15
REFRESH_TOKEN_EXPIRE_DAYS=7

# ===== Redis =====
REDIS_URL=redis://localhost:6379/0

# ===== App =====
APP_ENV=development
APP_DEBUG=true
APP_PORT=8080`,
        },
      ], 12.5),

      // ===================== 代码编辑块：核心业务逻辑 =====================
      codeEdit(bId(), 'src/services/auth_service.py', 'python',
        `"""JWT 认证服务"""
from datetime import datetime, timedelta, timezone
from jose import JWTError, jwt
from passlib.context import CryptContext
from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from sqlalchemy.ext.asyncio import AsyncSession
from pydantic import BaseModel
import os

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/v1/auth/login")

SECRET_KEY = os.getenv("JWT_SECRET_KEY", "dev-secret")
ALGORITHM = os.getenv("JWT_ALGORITHM", "HS256")
ACCESS_TOKEN_EXPIRE = int(os.getenv("ACCESS_TOKEN_EXPIRE_MINUTES", "15"))

class TokenPayload(BaseModel):
    sub: str       # username
    exp: datetime
    scopes: list[str] = []

def create_access_token(username: str, scopes: list[str] | None = None) -> str:
    expire = datetime.now(timezone.utc) + timedelta(minutes=ACCESS_TOKEN_EXPIRE)
    payload = TokenPayload(
        sub=username, exp=expire, scopes=scopes or ["user"]
    )
    return jwt.encode(payload.model_dump(), SECRET_KEY, algorithm=ALGORITHM)

async def get_current_user(
    token: str = Depends(oauth2_scheme),
    session: AsyncSession = Depends(get_db),
) -> User:
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        username: str = payload.get("sub")
        if not username:
            raise HTTPException(status_code=401, detail="无效的认证凭证")
    except JWTError:
        raise HTTPException(status_code=401, detail="Token 已过期或无效")
    user = await get_user_by_username(session, username)
    if not user or not user.is_active:
        raise HTTPException(status_code=403, detail="用户不存在或已禁用")
    return user`,
        4.8),

      // ===================== 网页搜索块 =====================
      webSearch(bId(), 'FastAPI 异步依赖注入 + Redis 缓存最佳实践', [
        {
          title: 'FastAPI Depends 异步模式深入解析',
          url: 'https://fastapi.tiangolo.com/advanced/advanced-dependencies/',
          icon: '\u{1F4D8}', summary: 'yield 依赖支持 setup/teardown，适合数据库连接池管理。',
          contentExpanded: false, status: 'pending',
          content: `异步依赖注入要点:
  1. 使用 async def get_db() → yield session
  2. Context Manager 自动清理资源
  3. 嵌套依赖支持：Depends(a) → Depends(b)
  4. 子依赖异常自动传播
HTTP 200 . 7.2 KB . 抓取耗时 234ms`,
        },
        {
          title: 'Redis 缓存模式：Cache-Aside 实现',
          url: 'https://redis.io/docs/latest/develop/use/patterns/cache-aside/',
          icon: '\u{1F9E0}', summary: '先查缓存 → 未命中查 DB → 回写缓存，适合读多写少场景。',
          contentExpanded: false, status: 'pending',
          content: `Cache-Aside 模式实现:
  async def get_with_cache(key: str):
    cached = await redis.get(key)
    if cached: return json.loads(cached)
    data = await db.query(...)
    await redis.setex(key, 300, json.dumps(data))
    return data

  注意: TTL 建议设为 5min，库存等易变数据需主动失效
HTTP 200 . 5.8 KB . 抓取耗时 189ms`,
        },
        {
          title: '2026 Python Web 框架性能对比 (FastAPI vs Litestar)',
          url: 'https://example.com/python-web-bench-2026',
          icon: '\u{1F4CA}', summary: 'FastAPI 在并发 1000 连接下吞吐 12,400 req/s，推荐搭配 Uvicorn + Gunicorn。',
          contentExpanded: false, status: 'pending',
          content: `基准测试结果 (16核 / 32GB):
  FastAPI + Uvicorn:  12,400 req/s (p99 28ms)
  Litestar:           11,800 req/s (p99 32ms)
  Blacksheep:          9,200 req/s (p99 45ms)
  Django + ASGI:       4,100 req/s (p99 120ms)

  建议: 生产环境使用 gunicorn -k uvicorn.workers.UvicornWorker -w 8
HTTP 200 . 6.4 KB . 抓取耗时 278ms`,
        },
      ], 3.8),

      // ===================== 复合思考块：代码编写 + 验证 =====================
      complex(bId(), '核心功能实现：路由层 + 测试 + 部署验证', [
        {
          type: 'code_edit',
          label: '创建 src/routes/user_routes.py 路由层',
          target: 'src/routes/user_routes.py',
          detail: '新建 7 个 RESTful 端点：注册、获取、更新、删除、列表，含权限控制。',
          result: `from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from src.services.auth_service import get_current_user
from src.models.user import User
from src.schemas.user import UserCreate, UserResponse, UserUpdate
from src.services.user_service import (
    create_user, get_user_by_id, update_user, delete_user, list_users
)
from src.core.deps import get_db, get_redis

router = APIRouter(prefix="/api/v1/users", tags=["Users"])

@router.post("/", response_model=UserResponse, status_code=201)
async def register(
    data: UserCreate,
    session: AsyncSession = Depends(get_db),
):
    existing = await get_user_by_username(session, data.username)
    if existing:
        raise HTTPException(409, "用户名已存在")
    return await create_user(session, data)

@router.get("/me", response_model=UserResponse)
async def read_me(user: User = Depends(get_current_user)):
    return user

@router.get("/{user_id}", response_model=UserResponse)
async def read_user(
    user_id: int,
    session: AsyncSession = Depends(get_db),
):
    user = await get_user_by_id(session, user_id)
    if not user:
        raise HTTPException(404, "用户不存在")
    return user

@router.put("/{user_id}", response_model=UserResponse)
async def update_user_profile(
    user_id: int, data: UserUpdate,
    session: AsyncSession = Depends(get_db),
    current: User = Depends(get_current_user),
):
    if current.id != user_id and not current.is_superuser:
        raise HTTPException(403, "无权修改他人信息")
    return await update_user(session, user_id, data)

@router.delete("/{user_id}", status_code=204)
async def remove_user(
    user_id: int,
    session: AsyncSession = Depends(get_db),
    current: User = Depends(get_current_user),
):
    if not current.is_superuser:
        raise HTTPException(403, "仅管理员可删除用户")
    await delete_user(session, user_id)`,
        },
        {
          type: 'mcp_execute',
          label: '运行 pytest 测试套件 (初次)',
          target: 'python.run_tests',
          detail: '初次运行 2/4 失败：缺少 user_roles 关联表导致 500 错误。',
          finalStatus: 'failed',
          result: `tests/test_user_api.py::test_user_register FAILED
tests/test_user_api.py::test_login_success FAILED
tests/test_user_api.py::test_get_me PASSED
tests/test_user_api.py::test_list_users PASSED

FAILED test_user_register - assert 500 == 201
  Error: sqlalchemy.exc.OperationalError: relation "user_roles" does not exist
  → 缺少 user_roles 关联表，创建迁移脚本...

[ERROR] 2/4 测试失败 —— 缺少 user_roles 关联表`,
        },
        {
          type: 'code_edit',
          label: '补充 user_roles 关联表模型 + 迁移',
          target: 'src/models/role.py',
          detail: '新建 user_roles 关联表，含复合主键和外键级联删除。',
          result: `from sqlalchemy import Column, String, Integer, ForeignKey, Table
from src.models.user import Base

user_roles = Table(
    'user_roles', Base.metadata,
    Column('user_id', Integer, ForeignKey('users.id', ondelete='CASCADE'), primary_key=True),
    Column('role', String(50), primary_key=True),
    Column('assigned_at', DateTime, ...)
    # 添加 roles 表定义中...
)
# Fix: added user_roles table with FK cascading delete`,
        },
        {
          type: 'mcp_execute',
          label: '重新运行 pytest (修复后)',
          target: 'python.run_tests',
          detail: '修复后 12/12 全部通过，覆盖率 91.2%。',
          result: `============================= test session starts =============================
collected 12 items

tests/test_auth.py::test_hash_password PASSED                    [  8%]
tests/test_auth.py::test_verify_password PASSED                  [ 16%]
tests/test_auth.py::test_create_token PASSED                     [ 25%]
tests/test_user_api.py::test_user_register PASSED                [ 33%]
tests/test_user_api.py::test_register_duplicate PASSED           [ 41%]
tests/test_user_api.py::test_login_success PASSED                [ 50%]
tests/test_user_api.py::test_login_bad_password PASSED           [ 58%]
tests/test_user_api.py::test_get_me PASSED                       [ 66%]
tests/test_user_api.py::test_list_users PASSED                   [ 75%]
tests/test_user_api.py::test_update_own_profile PASSED           [ 83%]
tests/test_user_api.py::test_forbidden_cross_update PASSED       [ 91%]
tests/test_user_api.py::test_admin_delete_user PASSED            [100%]

12 passed in 4.87s
Coverage: 91.2% (178/195 lines)

✓ 全部 12 个测试通过，覆盖率 91.2%`,
        },
        {
          type: 'command',
          label: 'uvicorn src.main:app --host 0.0.0.0 --port 8080 --reload &',
          detail: '启动 FastAPI 服务，监听 8080 端口，启用热重载。',
          result: `INFO:     Started server process [28471]
INFO:     Waiting for application startup.
INFO:     Application startup complete.

Uvicorn running on http://0.0.0.0:8080 (Press CTRL+C to quit)

✓ 服务启动成功，监听 8080 端口`,
        },
        {
          type: 'file_gen',
          label: '生成 API 测试脚本 tests/test_user_api.py',
          detail: '生成含 12 个测试用例的异步测试套件，覆盖全部端点。',
          result: `"""用户管理 API 测试套件 — 12 个测试用例"""
import pytest
from httpx import AsyncClient, ASGITransport
from src.main import app
from src.models.user import User

@pytest.fixture
async def client():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        yield ac

@pytest.mark.asyncio
async def test_user_register(client): ...
@pytest.mark.asyncio
async def test_register_duplicate(client): ...
@pytest.mark.asyncio
async def test_login_success(client): ...
# ... 共 12 个测试用例`,
        },
      ], 11.2),

      // ===================== 文件查询块 =====================
      fileQuery(bId(), [
        { title: 'src/models/user.py', url: '/workspace/src/models/user.py' },
        { title: 'src/models/role.py', url: '/workspace/src/models/role.py' },
        { title: 'src/services/auth_service.py', url: '/workspace/src/services/auth_service.py' },
        { title: 'src/routes/user_routes.py', url: '/workspace/src/routes/user_routes.py' },
        { title: 'tests/test_user_api.py', url: '/workspace/tests/test_user_api.py' },
        { title: 'migrations/001_create_users_table.sql', url: '/workspace/migrations/001_create_users_table.sql' },
        { title: '.env.example', url: '/workspace/.env.example' },
      ], 1.8),

      // ===================== 方法执行块：MCP 推送部署 =====================
      mcpExec(bId(), 'git.create_branch_and_push',
        '{"branch":"feature/user-management-api","files":["src/models/user.py","src/models/role.py","src/services/auth_service.py","src/routes/user_routes.py","src/schemas/user.py","src/core/deps.py","tests/test_user_api.py",".env.example"],"base":"main"}',
        `{
  "status": "success",
  "branch": {
    "name": "feature/user-management-api",
    "base": "main",
    "url": "https://gitee.com/team/api-service/tree/feature/user-management-api"
  },
  "commit": {
    "hash": "a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0",
    "message": "feat: 用户管理 API 服务 (JWT auth + bcrypt + 7 REST endpoints)",
    "author": "Dev Team <dev@example.com>",
    "timestamp": "2026-05-22T18:45:30+08:00"
  },
  "diff_stats": {
    "files_changed": 8,
    "insertions": 486,
    "deletions": 18,
    "summary": [
      {"path": "src/models/user.py", "status": "A", "lines": "+52/-0"},
      {"path": "src/models/role.py", "status": "A", "lines": "+23/-0"},
      {"path": "src/services/auth_service.py", "status": "A", "lines": "+68/-0"},
      {"path": "src/routes/user_routes.py", "status": "A", "lines": "+89/-0"},
      {"path": "src/schemas/user.py", "status": "A", "lines": "+42/-0"},
      {"path": "src/core/deps.py", "status": "A", "lines": "+36/-0"},
      {"path": "tests/test_user_api.py", "status": "A", "lines": "+142/-0"},
      {"path": ".env.example", "status": "A", "lines": "+34/-0"}
    ]
  },
  "ci": {
    "status": "success",
    "pipeline_url": "https://ci.example.com/pipelines/3142",
    "checks": {
      "ruff_lint": "pass (0 errors)",
      "type_check": "pass (mypy strict mode)",
      "unit_test": "pass (12/12, coverage 91.2%)",
      "security_scan": "pass (0 vulnerabilities)"
    }
  },
  "review_url": "https://gitee.com/team/api-service/pulls/new/feature/user-management-api"
}`,
        3.2),

      // ===================== HTML 渲染块 =====================
      htmlRender(bId(), 'API 文档预览',
        `<!DOCTYPE html><html><head><meta charset="utf-8"><style>
body{font-family:system-ui;max-width:720px;margin:30px auto;background:#f8fafc;padding:20px}
h1{color:#1e293b;font-size:24px;margin-bottom:4px}
.sub{color:#94a3b8;font-size:13px;margin-bottom:24px}
.endpoint{background:#fff;border-radius:10px;padding:16px;margin-bottom:12px;box-shadow:0 1px 3px rgba(0,0,0,.06);display:flex;align-items:center;gap:12px}
.method{width:70px;padding:4px 8px;border-radius:6px;font-size:12px;font-weight:700;text-align:center;flex-shrink:0}
.post{background:#dbeafe;color:#1d4ed8}
.get{background:#dcfce7;color:#16a34a}
.put{background:#fef3c7;color:#d97706}
.delete{background:#fee2e2;color:#dc2626}
.path{font-family:monospace;font-size:13px;color:#334155;flex:1}
.desc{font-size:12px;color:#94a3b8}
.auth-badge{background:#f0f9ff;color:#0369a1;font-size:11px;padding:2px 8px;border-radius:4px}
</style></head><body>
<h1>📘 用户管理 API v1.0</h1>
<div class="sub">Base: http://localhost:8080 &bull; Auth: JWT Bearer Token</div>

<div class="endpoint">
<span class="method post">POST</span>
<span class="path">/api/v1/users/</span>
<span class="desc">注册新用户</span>
</div>

<div class="endpoint">
<span class="method post">POST</span>
<span class="path">/api/v1/auth/login</span>
<span class="desc">登录获取 Token</span>
<span class="auth-badge">No Auth</span>
</div>

<div class="endpoint">
<span class="method get">GET</span>
<span class="path">/api/v1/users/me</span>
<span class="desc">获取当前用户信息</span>
<span class="auth-badge">Required</span>
</div>

<div class="endpoint">
<span class="method get">GET</span>
<span class="path">/api/v1/users/{user_id}</span>
<span class="desc">获取指定用户信息</span>
</div>

<div class="endpoint">
<span class="method put">PUT</span>
<span class="path">/api/v1/users/{user_id}</span>
<span class="desc">更新用户资料</span>
<span class="auth-badge">Owner/Admin</span>
</div>

<div class="endpoint">
<span class="method delete">DEL</span>
<span class="path">/api/v1/users/{user_id}</span>
<span class="desc">删除用户</span>
<span class="auth-badge">Admin Only</span>
</div>

<div class="endpoint">
<span class="method get">GET</span>
<span class="path">/api/v1/users/?page=1&size=20</span>
<span class="desc">分页用户列表</span>
<span class="auth-badge">Required</span>
</div>
</body></html>`,
        'API 文档预览渲染完成，7 个端点 + JWT 认证标识',
        2.5),

      // ===================== 文件生成块 =====================
      genFiles(bId(), [
        { name: 'src/models/user.py', type: 'py', content: 'code://user_model.py' },
        { name: 'src/services/auth_service.py', type: 'py', content: 'code://auth_service.py' },
        { name: 'src/routes/user_routes.py', type: 'py', content: 'code://user_routes.py' },
        { name: 'tests/test_user_api.py', type: 'py', content: 'code://test_user_api.py' },
        { name: 'DEPLOY.md', type: 'md', content: 'markdown://deploy_guide.md' },
      ], 2.0),
    ],
  },

  // ================================================================
  // 场景6: 复合思考多步骤执行（数据导入完整流程）
  // ================================================================
  {
    keywords: ['导入报告', '完整流程', '复合示例', '数据导入报告', 'sql导入', '数据库导入'],
    report: `<h2>📊 数据导入与报告生成任务执行报告</h2>

<h3>一、任务概要</h3>
<p>本次任务通过<strong>复合思考（complex_thinking）</strong>编排了完整的"SQL 数据导入 → 报告生成"流程，覆盖全部 8 种步骤类型：命令执行、文件查看、代码编辑、文件写入、网页搜索、方法执行（含失败重试）、方法验证和文件生成，全面展示了多步骤复合编排与容错恢复能力。</p>

<h3>二、执行流程</h3>
<table><tr><th>#</th><th>类型</th><th>操作</th><th>结果</th></tr>
<tr><td>1</td><td>💻 命令执行</td><td>工作目录扫描 + PostgreSQL 连通性检测</td><td>✅ 就绪</td></tr>
<tr><td>2</td><td>📂 文件查看</td><td>读取 sql_ddl.sql 识别表结构</td><td>✅ 2 张表</td></tr>
<tr><td>3</td><td>📝 代码编辑</td><td>优化 import_sql.py 异常处理与连接池</td><td>✅ +18/-4 行</td></tr>
<tr><td>4</td><td>✏️ 文件写入</td><td>修正 config.yml 端口 + 超时配置</td><td>✅ 1.4 KB</td></tr>
<tr><td>5</td><td>🌐 网页搜索</td><td>PostgreSQL 批量导入性能优化</td><td>✅ 3 条结果</td></tr>
<tr><td>6</td><td>⚙️ 方法执行</td><td>首次连接超时失败</td><td>❌ timeout</td></tr>
<tr><td>7</td><td>⚙️ 方法执行(重试)</td><td>调整超时后重试成功</td><td>✅ 2,847 条</td></tr>
<tr><td>8</td><td>🔬 方法执行(验证)</td><td>数据完整性校验（5 项检查）</td><td>✅ all passed</td></tr>
<tr><td>9</td><td>📦 文件生成</td><td>生成数据导入报告.docx</td><td>✅ 28.4 KB</td></tr></table>

<h3>三、关键发现</h3>
<ul>
<li><strong>代码健壮性</strong>：新增 try/except/finally 异常保护后，导入成功率从 91% 提升至 99.7%</li>
<li><strong>配置修正</strong>：端口从 5432 → 5433，添加 connect_timeout 避免长时间挂起</li>
<li><strong>COPY 命令优化</strong>：PostgreSQL 官方建议用 COPY 替代逐条 INSERT，可提速 10-100 倍</li>
<li><strong>索引策略</strong>：导入前 DROP INDEX、导入后重建，可额外提速 30%</li>
<li><strong>容错机制</strong>：首次方法执行因 10s 超时失败，调整 connect_timeout 后重试成功</li>
</ul>

<h3>四、产出文件</h3>
<ul>
<li><code>import_sql.py</code> — 优化后的导入脚本（含异常捕获 + 日志输出）</li>
<li><code>数据导入报告.docx</code> — 完整导入结果报告（28.4 KB）</li>
</ul>

<blockquote>💡 <strong>优化建议</strong>：批量导入时可临时关闭 foreign_key_checks 和索引，导入后统一重建，可进一步提升导入性能。</blockquote>`,
    blocks: (_i: string) => [
      complex(bId(), '为了完成完整的数据导入与报告生成流程，我需要执行多步操作：编辑脚本、查看文件、搜索资料、调用方法并生成成果文件。', [
        {
          type: 'command',
          label: '检查环境',
          target: '工作目录扫描',
          detail: '列出工作目录文件，确认项目结构和数据文件就绪。',
          result: `$ ls -lah /workspace/
total 6.4M
drwxr-xr-x  6 user  staff   192B  ./
drwxr-xr-x  3 user  staff    96B  ../
-rw-r--r--  1 user  staff   4.2K  sql_ddl.sql
-rw-r--r--  1 user  staff   5.8M  sql_insert.sql
-rw-r--r--  1 user  staff   1.2K  config.yml
drwxr-xr-x  2 user  staff    64B  outputs/

文件就绪: 2 个 SQL 文件 + 1 个配置文件
$ pg_isready -h localhost -p 5432
localhost:5432 - accepting connections ✓`,
        },
        {
          type: 'file_read',
          label: '查看文件',
          target: 'sql_ddl.sql',
          detail: '已读取 4.2 KB，识别 student_info / student_score 两张数据表。',
          result: `CREATE TABLE student_info (
    id          SERIAL PRIMARY KEY,
    student_no  VARCHAR(20) UNIQUE NOT NULL,
    name        VARCHAR(50) NOT NULL,
    department  VARCHAR(50),
    ...
);
CREATE TABLE student_score (
    id          SERIAL PRIMARY KEY,
    student_no  VARCHAR(20) NOT NULL,
    course_name VARCHAR(80) NOT NULL,
    score       NUMERIC(5,2),
    ...
);`,
        },
        {
          type: 'code_edit',
          label: '编辑文件',
          target: 'import_sql.py',
          detail: '新增异常捕获与日志输出，优化连接池复用逻辑（+18 / -4 行）。',
          result: `@@ -10,4 +10,18 @@
- conn = psycopg2.connect(host=host, dbname=dbname, user=user, password=password)
- conn.autocommit = True
- cursor = conn.cursor()
- cursor.execute(open(file_path).read())
+ try:
+     conn = psycopg2.connect(
+         host=host, dbname=dbname,
+         user=user, password=password,
+         connect_timeout=10
+     )
+     conn.autocommit = True
+     cursor = conn.cursor()
+     with open(file_path, 'r', encoding='utf-8') as f:
+         cursor.execute(f.read())
+     logger.info(f"Imported {file_path}")
+ except Exception as e:
+     logger.error(f"Failed to import {file_path}: {e}")
+     raise
+ finally:
+     if cursor: cursor.close()
+     if conn: conn.close()`,
        },
        {
          type: 'file_write',
          label: '写入文件',
          target: 'config.yml',
          detail: '更新数据库连接配置，将端口从 5432 修正为 5433，添加连接超时参数。',
          result: `@@ -2,6 +2,8 @@ database:
   host: localhost
-  port: 5432
+  port: 5433
   dbname: student_db
   user: postgres
+  connect_timeout: 10
+  application_name: import_tool
 charset: utf8mb4

写入成功 · config.yml · 1.4 KB`,
        },
        {
          type: 'web_search',
          label: '网页搜索',
          target: 'PostgreSQL 批量导入性能优化',
          detail: '获取到 3 条权威结果，已用于优化导入策略。',
          searchResults: [
            {
              title: 'PostgreSQL 官方文档 - COPY 命令',
              url: 'https://www.postgresql.org/docs/current/sql-copy.html',
              icon: '\u{1F310}',
              summary: 'COPY 比 INSERT 快 10-100 倍，推荐用于大批量导入。',
              contentExpanded: false, status: 'pending',
              content: `# COPY — 在文件和表之间复制数据

COPY 命令在 PostgreSQL 表和操作系统文件之间移动数据。COPY TO 将表内容
导出到文件，COPY FROM 从文件读取数据并追加到表中。

性能要点：
  - 单事务批量执行，比逐条 INSERT 快 10-100 倍
  - 自动关闭索引检查（仅在 COPY 完成后统一更新）
  - 支持 CSV / TEXT / BINARY 三种格式
  - 推荐与 SET LOCAL synchronous_commit = OFF 搭配

HTTP 200 · 17.4 KB · 抓取耗时 412ms`,
            },
            {
              title: 'PostgreSQL Wiki - Bulk Loading',
              url: 'https://wiki.postgresql.org/wiki/BulkLoading',
              icon: '\u{1F4C4}',
              summary: '导入前 DROP INDEX，导入后再 CREATE，可提速 30%。',
              contentExpanded: false, status: 'pending',
              content: `Bulk Loading and Restores

加速批量导入的清单：
  1. 关闭 autocommit，将所有 INSERT/COPY 包在单事务里
  2. 优先使用 COPY 而不是 INSERT
  3. 导入前 DROP INDEX，导入后再 CREATE INDEX
  4. 临时移除外键约束，结束后再加回
  5. 调高 maintenance_work_mem（建议 1GB+）
  6. 调高 max_wal_size，减少 checkpoint 频率
  7. 完成后立刻 ANALYZE 更新统计信息

实测：100 万行数据集，从 14 分钟降至 38 秒。

HTTP 200 · 8.9 KB · 抓取耗时 287ms`,
            },
            {
              title: '大批量数据导入 PostgreSQL 最佳实践',
              url: 'https://example.com/pg-bulk-load',
              icon: '\u{1F310}',
              summary: '调整 work_mem、maintenance_work_mem 与 wal_level=minimal。',
              contentExpanded: false, status: 'pending',
              content: `推荐的 postgresql.conf 调整：

  shared_buffers = 25% RAM
  work_mem = 64MB
  maintenance_work_mem = 1GB
  wal_level = minimal           # 单机批量导入场景
  max_wal_senders = 0
  archive_mode = off
  fsync = on                    # 不要为了速度关闭，会丢数据
  synchronous_commit = off      # 可显著提速、风险可控

导入完成后请记得改回安全配置。

HTTP 200 · 6.2 KB · 抓取耗时 198ms`,
            },
          ],
        },
        {
          type: 'mcp_execute',
          label: '方法执行',
          target: 'postgres.execute_query',
          detail: '初次调用因连接超时失败。',
          finalStatus: 'failed',
          result: `ERROR: connection to server at "localhost" (127.0.0.1), port 5432 failed
Detail: timeout expired (10s)
Hint: 检查数据库是否启动，或调整 connect_timeout 参数。`,
        },
        {
          type: 'mcp_execute',
          label: '方法执行（重试）',
          target: 'postgres.execute_query',
          detail: '调整超时参数后重试成功，返回记录数 2,847。',
          result: `{
  "rows": [{ "count": 2847 }],
  "rowCount": 1,
  "duration_ms": 124
}`,
        },
        {
          type: 'method_exec',
          label: '方法执行',
          target: 'data_validation.check_integrity',
          detail: '验证导入数据完整性：外键约束、唯一索引、行数匹配检查。',
          result: `{
  "status": "passed",
  "checks": [
    { "name": "行数匹配", "expected": 2847, "actual": 2847, "result": "ok" },
    { "name": "外键完整性", "orphan_count": 0, "result": "ok" },
    { "name": "唯一约束", "duplicates": 0, "result": "ok" },
    { "name": "课程成绩范围", "out_of_range": 0, "result": "ok" },
    { "name": "院系统计分布", "departments": 8, "result": "ok" }
  ],
  "conclusion": "数据完整性验证全部通过 ✓",
  "duration_ms": 287
}`,
        },
        {
          type: 'file_gen',
          label: '生成文件',
          target: '数据导入报告.docx',
          detail: '已写出至默认工作目录。',
          result: `Generated: /Users/luoxiaodong/Desktop/学生数据/outputs/数据导入报告.docx
Size: 28.4 KB
Sections: 概述 / 执行步骤 / 结果统计 / 表结构
Status: ok`,
        },
      ], 32.4),
    ],
  },

  // ================================================================
  // 场景7: 默认通用场景
  // ================================================================
  {
    keywords: [],
    report: `<h2>📋 任务执行报告</h2>

<h3>一、执行摘要</h3>
<p>任务已按照需求规划执行完毕。整个过程经历了需求分析、资源准备、代码编写、质量验证和结果产出五个阶段，所有步骤均通过验证。</p>

<table><tr><th>阶段</th><th>状态</th><th>说明</th></tr>
<tr><td>需求分析</td><td>✅</td><td>完成需求拆解和可行性评估</td></tr>
<tr><td>资源准备</td><td>✅</td><td>检查必要的工具和数据源</td></tr>
<tr><td>代码实现</td><td>✅</td><td>新增功能模块和路由配置</td></tr>
<tr><td>质量验证</td><td>✅</td><td>TypeScript 零错误，测试覆盖率 87%</td></tr>
<tr><td>结果产出</td><td>✅</td><td>生成 3 个交付文件</td></tr></table>

<h3>二、技术栈</h3>
<p>项目采用 <strong>Vue 3 + Pinia + TypeScript</strong> 技术栈，遵循 Composition API 最佳实践。新增的组件复用 <code>defineProps</code> 和 <code>defineEmits</code> 进行类型安全的父子通信，使用计算属性实现响应式过滤搜索功能。</p>

<h3>三、代码变更</h3>
<ul>
<li><strong>新增</strong> <code>src/services/api.ts</code> — API 调用封装层，统一错误处理</li>
<li><strong>新增</strong> <code>src/components/NewFeature.vue</code> — 带搜索的列表选择组件</li>
<li><strong>更新</strong> <code>src/types.ts</code> — 补充 User / Task 类型定义</li>
</ul>

<h3>四、后续建议</h3>
<ul>
<li>组件可进一步抽取为可复用 composable（useSearch / useSelection）</li>
<li>建议补充 E2E 测试覆盖关键用户路径</li>
<li>CI 流程中增加 lighthouse 性能检查，确保构建产物质量</li>
</ul>

<blockquote>✅ 代码已推送至仓库，可在对应的 feature 分支查看完整变更。</blockquote>`,
    blocks: (input: string) => [
      think(bId(), `好的，让我来帮你完成这个任务。首先我需要理解你的需求并规划执行方案。${input.length > 80 ? '\n需求分析：' + input.slice(0, 60) + '...' : ''}`, [
        {
          type: 'web_search', label: '搜索相关资料和最佳实践 (1/3)',
          target: 'best practices reference',
          searchResults: [
            { title: '官方文档 - 最新 API 规范', url: 'https://docs.example.com/api', icon: '\u{1F4D8}', summary: '官方 API 参考文档，包含完整的类型定义和示例代码。', contentExpanded: false, status: 'pending', content: 'API Reference v3.2\n包含所有端点定义、请求/响应格式\nHTTP 200 . 12.4 KB . 抓取耗时 234ms' },
          ],
        },
        {
          type: 'web_search', label: '搜索相关资料和最佳实践 (2/3)',
          target: 'community best practices',
          finalStatus: 'failed',
          searchResults: [
            { title: '技术博客 - 业界实践案例', url: 'https://blog.example.com/best-practices', icon: '\u{1F4DD}', summary: '社区最佳实践汇总，包含常见坑点和解决方案。', contentExpanded: false, status: 'pending', content: 'HTTP 404 . 页面不存在 (blog 迁移至新域名)\n建议: 访问 https://new-blog.example.com/practices' },
          ],
        },
        {
          type: 'web_search', label: '搜索相关资料和最佳实践 (3/3)',
          target: 'Stack Overflow solutions',
          searchResults: [
            { title: 'Stack Overflow - 常见问题解答', url: 'https://stackoverflow.com/questions/tagged/typescript', icon: '\u{1F9E9}', summary: '318 个相关问题，Top 5 答案已整合到下方。', contentExpanded: false, status: 'pending', content: 'Top 问答:\n1. 如何处理异步错误边界\n2. TypeScript strict 模式迁移指南\n3. 泛型约束最佳实践\nHTTP 200 . 8.7 KB . 抓取耗时 312ms' },
          ],
        },
        {
          type: 'command', label: 'ls -R ./workspace/',
          result: `./workspace/:
src/  config/  output/

./workspace/src:
main.ts  utils.ts  types.ts

./workspace/config:
settings.json  .env.example

./workspace/output: (空)`,
        },
        {
          type: 'file_read', label: '读取 settings.json 配置',
          result: `{
  "project": "aipcowork-demo",
  "version": "1.0.0",
  "language": "typescript",
  "strict": true,
  "target": "es2022",
  "module": "esnext"
}`,
        },
      ], 5.8),

      think(bId(), '我已经了解了项目结构和需求，现在制定详细执行计划。', [
        {
          type: 'file_read', label: '分析 src/main.ts 入口文件',
          result: `import { createApp } from 'vue'
import App from './App.vue'
import { router } from './router'
import { createPinia } from 'pinia'

const app = createApp(App)
app.use(createPinia())
app.use(router)
app.mount('#app')`,
        },
        {
          type: 'file_read', label: '分析 src/types.ts 类型定义',
          result: `export interface User {
  id: number; name: string; email: string;
}
export interface Task {
  id: string; title: string; status: 'todo' | 'in_progress' | 'done';
}
export interface Project {
  id: string; name: string; tasks: Task[];
}`,
        },
      ], 6.0, [
        { name: '项目分析', desc: 'Vue 3 + Pinia + TypeScript strict 模式' },
        { name: '需求拆解', desc: '需要新增功能模块、类型定义和路由配置' },
        { name: '搜索结果', desc: '3 组搜索中 1 组返回 404，已使用备用文档替代' },
      ], '下面按计划逐步执行。'),

      think(bId(), '正在执行核心逻辑，创建所需文件和代码。', [
        {
          type: 'code_edit', label: '编辑 src/services/api.ts', target: 'api.ts',
          result: `export async function fetchData<T>(url: string): Promise<T> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(\`HTTP \${res.status}: \${res.statusText}\`);
  return res.json();
}

export class ApiClient {
  constructor(private baseUrl: string) {}
  async get<T>(path: string): Promise<T> {
    return fetchData<T>(\`\${this.baseUrl}\${path}\`);
  }
}`,
        },
        {
          type: 'code_edit', label: '编辑 src/utils.ts 新增工具函数', target: 'utils.ts',
          result: `export function debounce<T extends (...args: any[]) => any>(
  fn: T, delay: number
): (...args: Parameters<T>) => void {
  let timer: ReturnType<typeof setTimeout>;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), delay);
  };
}`,
        },
        {
          type: 'command', label: 'npm run type-check (初次运行)',
          finalStatus: 'failed',
          result: `src/services/api.ts:2:19 - error TS7006: Parameter 'url' implicitly has an 'any' type.
src/services/api.ts:8:12 - error TS18046: 'fetchData' is of type 'unknown'.
src/utils.ts:1:14 - error TS7006: Parameter 'fn' implicitly has an 'any' type.

Found 3 errors in 2 files.

[ERROR] TypeScript 严格模式类型检查失败 —— 3 个类型推断错误。
→ 修复方案：为函数参数显式添加类型标注`,
        },
        {
          type: 'code_edit', label: '修复 api.ts 类型标注', target: 'api.ts (fix)',
          result: `@@ -1,5 +1,5 @@
 export async function fetchData<T>(url: string): Promise<T> {
-  const res = await fetch(url);
+  const res: Response = await fetch(url);
   if (!res.ok) throw new Error(\`HTTP \${res.status}\`);
   return res.json();
 }`,
        },
        {
          type: 'command', label: 'npm run type-check (修复后重跑)',
          result: `✓ TypeScript 类型检查通过 (0 errors, 0 warnings)
  Files: 14  Time: 2.8s

  Target: ES2022  Module: ESNext  Mode: strict
  所有类型标注完整，strictNullChecks / noImplicitAny 均通过`,
        },
        {
          type: 'command', label: 'npm test -- --coverage',
          result: `Test Suites: 8 passed, 8 total
Tests:       42 passed, 42 total
Snapshots:   0 total
Time:        3.42s

Coverage:
  Statements  : 89.7% ( 156/174 )
  Branches    : 84.2% (  64/76  )
  Functions   : 91.3% (  42/46  )
  Lines       : 89.1% ( 148/166 )

✓ 所有测试通过，覆盖率 > 84%`,
        },
      ], 9.5, [
        { name: '代码实现', desc: '新增 api.ts、utils.ts，更新 types.ts' },
        { name: '质量验证', desc: 'TypeScript strict 零错误，42 个测试全通过' },
        { name: '修复记录', desc: '初次 type-check 3 个错误已全部修复' },
      ], '核心逻辑已完成，类型检查全通过。'),

      codeEdit(bId(), 'src/components/NewFeature.vue', 'vue',
        `<script setup lang="ts">
import { ref, computed } from 'vue'

interface Props {
  title: string
  items: string[]
}
const props = defineProps<Props>()
const emit = defineEmits<{
  (e: 'select', id: string): void
}>()

const selected = ref<string | null>(null)
const filtered = computed(() =>
  props.items.filter(i => i.includes(selected.value || ''))
)

function handleClick(id: string) {
  selected.value = id
  emit('select', id)
}
</script>

<template>
  <div class="feature-panel">
    <h3>{{ title }}</h3>
    <input v-model="selected" placeholder="搜索..." />
    <ul>
      <li v-for="item in filtered" :key="item" @click="handleClick(item)">
        {{ item }}
      </li>
    </ul>
  </div>
</template>

<style scoped>
.feature-panel { padding: 16px; border: 1px solid #e2e8f0; border-radius: 8px; }
ul { list-style: none; padding: 0; }
li { padding: 8px; cursor: pointer; border-radius: 4px; }
li:hover { background: #f1f5f9; }
</style>`,
        5.5),

      webSearch(bId(), 'Vue 3 Composition API 最佳实践 2026', [
        {
          title: 'Vue 3.5 新特性一览',
          url: 'https://vuejs.org/guide/extras/composition-api-faq.html',
          icon: '\u{1F4D7}', summary: 'defineModel / useTemplateRef 等新 API 简化组件开发。',
          contentExpanded: false, status: 'pending',
          content: `Vue 3.5 核心更新:
  1. defineModel() - 简化 v-model 双向绑定
  2. useTemplateRef() - 类型安全的模板引用
  3. onWatcherCleanup() - 更优雅的 watch 清理
  4. SSR 性能提升 30%
HTTP 200 . 6.8 KB . 抓取耗时 267ms`,
        },
        {
          title: 'Pinia vs Vuex 迁移指南',
          url: 'https://pinia.vuejs.org/cookbook/migration-vuex.html',
          icon: '\u{1F504}', summary: 'Pinia 已取代 Vuex 成为官方推荐状态管理方案。',
          contentExpanded: false, status: 'pending',
          content: `迁移要点:
  - mutations 不再需要，直接用 actions
  - 支持 TypeScript 类型推导
  - 模块化设计，按需加载
HTTP 200 . 5.2 KB . 抓取耗时 189ms`,
        },
        {
          title: '大型 Vue 项目目录结构推荐',
          url: 'https://example.com/vue-architecture',
          icon: '\u{1F3D7}', summary: '按功能模块分层：views / composables / services / stores。',
          contentExpanded: false, status: 'pending',
          content: `推荐结构:
  src/
    composables/  # 可复用逻辑 hooks
    services/     # API / 业务逻辑
    stores/       # Pinia stores
    views/        # 页面组件
    components/   # 通用组件
HTTP 200 . 4.1 KB . 抓取耗时 176ms`,
        },
      ], 3.4),

      fileQuery(bId(), [
        { title: 'src/services/api.ts', url: '/workspace/src/services/api.ts' },
        { title: 'src/components/NewFeature.vue', url: '/workspace/src/components/NewFeature.vue' },
        { title: 'src/types.ts', url: '/workspace/src/types.ts' },
        { title: 'tests/feature.spec.ts', url: '/workspace/tests/feature.spec.ts' },
        { title: 'README.md', url: '/workspace/README.md' },
      ], 1.5),

      mcpExec(bId(), 'git.create_branch_and_push',
        '{"branch":"feature/new-module","files":["src/services/api.ts","src/components/NewFeature.vue","src/utils.ts","tests/feature.spec.ts"],"base":"main"}',
        `{
  "status": "success",
  "branch": {
    "name": "feature/new-module",
    "base": "main",
    "url": "https://gitee.com/eastonii/aipcowork/tree/feature/new-module"
  },
  "commit": {
    "hash": "8f3a2b1c4d5e6f7a8b9c0d1e2f3a4b5c6d7e8f9a0",
    "message": "feat: 新增功能模块 (api.ts + utils.ts + NewFeature.vue)",
    "author": "Easton <easton@team.dev>",
    "timestamp": "2026-05-22T17:30:15+08:00"
  },
  "diff_stats": {
    "files_changed": 4,
    "insertions": 342,
    "deletions": 12,
    "files": [
      {"path": "src/services/api.ts", "status": "A", "lines": "+78/-0"},
      {"path": "src/utils.ts", "status": "M", "lines": "+45/-3"},
      {"path": "src/components/NewFeature.vue", "status": "A", "lines": "+156/-0"},
      {"path": "tests/feature.spec.ts", "status": "A", "lines": "+63/-0"}
    ]
  },
  "diff_preview": {
    "src/services/api.ts": "@@ -0,0 +1,78 @@\\n+export async function fetchData<T>(url: string): Promise<T> {\\n+  const res: Response = await fetch(url);\\n+  if (!res.ok) throw new Error(...);\\n+  return res.json();\\n+}\\n+\\n+export class ApiClient {\\n+  constructor(private baseUrl: string) {}\\n+  async get<T>(path: string): Promise<T> { ... }\\n+}",
    "src/utils.ts": "@@ -12,3 +12,45 @@\\n+export function debounce<T extends (...args: any[]) => any>(\\n+  fn: T, delay: number\\n+): (...args: Parameters<T>) => void { ... }\\n+export function throttle<T>(fn: T, limit: number): T { ... }",
    "src/components/NewFeature.vue": "@@ -0,0 +1,156 @@\\n+<script setup lang=\\"ts\\">\\n+import { ref, computed } from 'vue'\\n+...\\n+</script>\\n+<template>\\n+  <div class=\\"feature-panel\\"> ...",
    "tests/feature.spec.ts": "@@ -0,0 +1,63 @@\\n+describe('NewFeature', () => {\\n+  it('renders items correctly', () => { ... });\\n+  it('filters by search input', () => { ... });\\n+});"
  },
  "ci": {
    "status": "success",
    "pipeline_url": "https://ci.example.com/pipelines/2847",
    "checks": {
      "type-check": "pass",
      "lint": "pass",
      "unit-test": "pass (42/42)",
      "build": "pass (3.2s)"
    }
  },
  "review_url": "https://gitee.com/eastonii/aipcowork/pulls/new/feature/new-module"
}`,
        2.8),

      htmlRender(bId(), '功能预览',
        `<!DOCTYPE html><html><head><meta charset="utf-8"><style>
body{font-family:system-ui;padding:40px;background:#fff;max-width:600px;margin:auto}
.panel{border:2px solid #e2e8f0;border-radius:12px;padding:24px}
.panel h3{color:#1e293b;margin:0 0 16px}
input{width:100%;padding:10px;border:1px solid #cbd5e1;border-radius:8px;font-size:14px;box-sizing:border-box;margin-bottom:12px}
.item{padding:10px 12px;border-radius:6px;cursor:pointer;font-size:14px;transition:background .15s}
.item:hover{background:#e0f2fe}.selected{background:#dbeafe;font-weight:600}
</style></head><body>
<div class="panel"><h3>功能列表</h3>
<input placeholder="搜索功能..." value="">
<div class="item">智能任务调度</div>
<div class="item selected">MCP 工具集成</div>
<div class="item">数据分析看板</div>
<div class="item">实时对话</div>
<div class="item">定时任务</div></div>
</body></html>`,
        '组件已渲染，搜索和选择交互正常',
        2.4),

      genFiles(bId(), [
        { name: 'src/services/api.ts', type: 'ts', content: 'code://api.ts' },
        { name: 'src/components/NewFeature.vue', type: 'vue', content: 'code://组件.vue' },
        { name: 'src/utils.ts', type: 'ts', content: 'code://utils.ts' },
        { name: '项目总结报告.md', type: 'md', content: 'markdown://总结.md' },
      ], 2.2),

      allComplexBlock(bId(),
        '整合交付阶段：代码增强 → 配置审计 → 环境生成 → 构建验证 → 方案检索 → 服务调用 → 质量检查 → 文档产出',
        22.4,
        'src/services/api.ts', '新增统一错误拦截器与请求重试机制，支持指数退避（+38 / -6 行）。',
        `@@ -15,6 +15,44 @@
- const response = await fetch(url, { method, headers, body })
- return response.json()
+ const MAX_RETRIES = 3
+
+ async function requestWithRetry(url: string, opts: RequestOptions): Promise<any> {
+     for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
+         try {
+             const response = await fetch(url, {
+                 method: opts.method,
+                 headers: { ...DEFAULT_HEADERS, ...opts.headers },
+                 body: opts.body,
+             })
+             if (!response.ok) {
+                 if (response.status >= 500 && attempt < MAX_RETRIES - 1) {
+                     await sleep(2 ** attempt * 1000)
+                     continue
+                 }
+                 throw new ApiError(response.status, await response.text())
+             }
+             return await response.json()
+         } catch (e) {
+             if (attempt === MAX_RETRIES - 1) throw e
+             await sleep(2 ** attempt * 1000)
+         }
+     }
+ }`,
        'package.json', '已读取项目配置：Vue 3 + TypeScript + Vite，含 12 项依赖。',
        `{
  "name": "aipcowork-demo",
  "version": "1.0.0",
  "scripts": { "dev": "vite", "build": "vue-tsc && vite build", "test": "vitest" },
  "dependencies": {
    "vue": "^3.5.0", "pinia": "^2.2.0",
    "vue-router": "^4.5.0", "axios": "^1.7.0"
  },
  "devDependencies": {
    "typescript": "^5.6.0", "vite": "^6.0.0",
    "@vitejs/plugin-vue": "^5.2.0", "vitest": "^2.1.0"
  }
}`,
        '.env.example', '生成环境变量模板：API 地址、日志级别和功能开关。',
        `VITE_API_BASE_URL=http://localhost:8080/api
VITE_APP_TITLE=AI Cowork Demo
VITE_LOG_LEVEL=debug
VITE_ENABLE_ANALYTICS=false
VITE_SENTRY_DSN=`,
        'npm run build', '构建项目，TypeScript 类型检查 + Vite 生产打包。',
        `$ npm run build
✓ vue-tsc --noEmit: TypeScript 零错误
✓ vite build:
  dist/index.html ................ 0.45 kB
  dist/assets/index-CaB3Lm8F.js . 128.30 kB
  dist/assets/index-DfGh1JkL.css  24.67 kB
✓ built in 4.82s
Gzip size: 51.23 kB (gzip)`,
        'TypeScript Vue3 项目最佳实践', '获取到 3 条参考资源，已用于指导代码质量优化。',
        [
          { title: 'Vue 3 Composition API 最佳实践', url: 'https://vuejs.org/guide/extras/composition-api-faq.html', icon: '\u{1F4D8}', summary: '使用 composable 抽取可复用逻辑，defineProps/defineEmits 实现类型安全。', contentExpanded: false, status: 'pending', content: '核心实践:\n- 用 composable 拆分逻辑而非 mixins\n- defineProps<T>() 强类型声明\n- computed 替代 watch 用于派生状态\n- shallowRef 优化大对象性能\nHTTP 200 . 14.2 KB . 抓取耗时 234ms' },
          { title: 'TypeScript 严格模式迁移指南', url: 'https://www.typescriptlang.org/tsconfig#strict', icon: '\u{1F9E9}', summary: '逐步启用 strictNullChecks → strict → noUncheckedIndexedAccess。', contentExpanded: false, status: 'pending', content: '迁移路线:\n1. strictNullChecks: 消除 null/undefined bug\n2. noImplicitAny: 消除隐式 any\n3. strictFunctionTypes: 函数参数协变检查\n4. useUnknownInCatchVariables: 强制 catch 类型声明\nHTTP 200 . 9.3 KB . 抓取耗时 198ms' },
          { title: 'Vite 生产构建优化方案', url: 'https://vitejs.dev/guide/build.html', icon: '\u{1F4E6}', summary: '代码分割 + 懒加载路由 + CSS-in-JS 按需引入，首屏可缩小 60%。', contentExpanded: false, status: 'pending', content: '构建优化:\n- dynamic import() 实现路由懒加载\n- manualChunks 分离 vendor / UI 库\n- terser 压缩 + brotli\n- purgeCSS 去除未使用样式\nHTTP 200 . 7.8 KB . 抓取耗时 267ms' },
        ],
        'service.execute',
        '{"status": "ok", "taskId": "task-20260523-001", "message": "Deployment triggered", "duration_ms": 234}',
        'quality_checker.validate', '质量验证：类型检查、测试覆盖、lint 和构建产物。',
        `{
  "status": "passed",
  "checks": {
    "typescript": {"passed":true,"errors":0},
    "test_coverage": {"passed":true,"lines":87,"branches":82,"statements":89},
    "eslint": {"passed":true,"errors":0,"warnings":0},
    "build_size": {"passed":true,"gzip_kb":51.23,"limit_kb":200},
    "accessibility": {"passed":true,"axe_errors":0}
  },
  "summary": "All 5 checks passed. Ready for production.",
  "duration_ms": 198
}`,
        '项目总结报告.md', '已写出至默认工作目录。',
        `Generated: /outputs/summary/项目总结报告.md
Size: 6.4 KB
Sections: 任务概览 / 代码变更 / 测试结果 / 后续建议
Status: ok`),

    ],
  },
]

// ============ 模拟引擎 ============
export interface SimulatorCallbacks {
  onBlockAdd: (block: ExecutionBlock) => void
  onBlockStatusChange: (blockId: string, status: 'pending' | 'running' | 'success' | 'failed') => void
  onStepStatusChange: (blockId: string, stepId: string, status: 'pending' | 'running' | 'success' | 'failed') => void
  onTimerTick: (elapsed: number) => void
  onComplete: (totalDuration: number, report: string) => void
}

function matchScenario(input: string): ScenarioTemplate {
  const lower = input.toLowerCase()
  for (const s of scenarios) {
    if (s.keywords.some(k => lower.includes(k.toLowerCase()))) return s
  }
  // defaultScenario is the last one (empty keywords)
  return scenarios[scenarios.length - 1]
}

export function runSimulation(task: TaskRecord, callbacks: SimulatorCallbacks) {
  const scenario = matchScenario(task.input)
  const blocks = scenario.blocks(task.input)

  let blockIdx = 0
  let totalElapsed = 0
  const timer = setInterval(() => { totalElapsed++; callbacks.onTimerTick(totalElapsed) }, 1000)

  function nextBlock() {
    if (blockIdx >= blocks.length) {
      clearInterval(timer)
      callbacks.onComplete(totalElapsed, scenario.report)
      return
    }

    const block = blocks[blockIdx]
    block.status = 'running'
    callbacks.onBlockAdd(block)
    callbacks.onBlockStatusChange(block.id, 'running')

    const durationMs = (block.duration ?? 3) * 1000

    // 有 steps 的块（thinking / complex_thinking）：逐个激活步骤
    if (block.steps.length > 0) {
      const stepDelay = durationMs / block.steps.length
      let stepIdx = 0
      const stepTimer = setInterval(() => {
        if (stepIdx < block.steps.length) {
          const step = block.steps[stepIdx]
          step.status = 'running'
          callbacks.onStepStatusChange(block.id, step.id, 'running')
          setTimeout(() => {
            const finalStatus = step.finalStatus || 'success'
            step.status = finalStatus
            callbacks.onStepStatusChange(block.id, step.id, finalStatus)
          }, Math.min(stepDelay * 0.55, 700))
          stepIdx++
        } else {
          clearInterval(stepTimer)
          block.status = 'success'
          callbacks.onBlockStatusChange(block.id, 'success')
          // 如果块包含 web_search results，逐个激活
          if (block.results && block.results.length > 0) {
            let ri = 0
            const resultDelay = 600
            const rt = setInterval(() => {
              if (ri < block.results!.length) {
                block.results![ri].status = 'success'
                ri++
              } else { clearInterval(rt) }
            }, resultDelay)
          }
          blockIdx++
          setTimeout(() => nextBlock(), 500)
        }
      }, stepDelay)
    } else {
      // 无步骤块：直接按 duration 完成
      setTimeout(() => {
        // 激活内部 results（web_search）
        if (block.results && block.results.length > 0) {
          let ri = 0
          const rt = setInterval(() => {
            if (ri < block.results!.length) { block.results![ri].status = 'success'; ri++ }
            else { clearInterval(rt) }
          }, 500)
        }
        block.status = 'success'
        callbacks.onBlockStatusChange(block.id, 'success')
        blockIdx++
        setTimeout(() => nextBlock(), 400)
      }, durationMs)
    }
  }

  setTimeout(() => nextBlock(), 800)
}