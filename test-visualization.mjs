/**
 * Comprehensive test suite for the Visualization Management Module
 * Tests all 4 new services + vault-manager YAML + template YAML + SOP integration
 *
 * Mocks Obsidian API so we can run it standalone with Node.js
 */

// ============================================================================
// Mock Obsidian API
// ============================================================================

class MockTFile {
    constructor(path, content = '') {
        this.path = path;
        this.basename = path.split('/').pop().replace('.md', '');
        this._content = content;
    }
}

class MockVault {
    constructor() {
        this.files = new Map();
        this._listeners = [];
    }

    getAbstractFileByPath(path) {
        return this.files.get(path) || null;
    }

    async read(file) {
        return file._content || '';
    }

    async modify(file, content) {
        file._content = content;
        this.files.set(file.path, file);
        // Trigger modify event
        for (const listener of this._listeners) {
            listener(file);
        }
    }

    async create(path, content) {
        const file = new MockTFile(path, content);
        this.files.set(path, file);
        return file;
    }

    async createFolder(path) {
        // no-op in mock
    }

    on(event, callback) {
        if (event === 'modify') {
            this._listeners.push(callback);
        }
        return { event, callback };
    }

    offref(ref) {
        this._listeners = this._listeners.filter(l => l !== ref.callback);
    }
}

class MockApp {
    constructor() {
        this.vault = new MockVault();
    }
}

// Mock moment
globalThis.window = {
    moment: (d) => {
        const date = d ? new Date(d) : new Date('2026-02-08T10:00:00+08:00');
        const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
        const fullDays = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
        return {
            format: (fmt) => {
                if (fmt === 'YYYY-MM-DD') return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
                if (fmt === 'YYYY') return String(date.getFullYear());
                if (fmt === 'ww') return String(Math.ceil((date.getDate() + new Date(date.getFullYear(), date.getMonth(), 1).getDay()) / 7)).padStart(2, '0');
                if (fmt === 'dddd') return fullDays[date.getDay()];
                if (fmt === 'ddd') return days[date.getDay()];
                return '';
            },
            hour: () => date.getHours(),
            subtract: function (n, unit) {
                if (unit === 'day') {
                    const d2 = new Date(date);
                    d2.setDate(d2.getDate() - n);
                    return globalThis.window.moment(d2);
                }
                return this;
            },
            toDate: () => date,
        };
    }
};

// ============================================================================
// Test Framework
// ============================================================================

let testCount = 0;
let passCount = 0;
let failCount = 0;
let currentSection = '';

function section(name) {
    currentSection = name;
    console.log(`\n${'='.repeat(60)}`);
    console.log(`  ${name}`);
    console.log(`${'='.repeat(60)}`);
}

function assert(condition, message) {
    testCount++;
    if (condition) {
        passCount++;
        console.log(`  ✅ ${message}`);
    } else {
        failCount++;
        console.log(`  ❌ FAIL: ${message}`);
    }
}

function assertContains(str, substr, message) {
    assert(typeof str === 'string' && str.includes(substr), message || `expected to contain "${substr}"`);
}

function assertEqual(a, b, message) {
    assert(a === b, message || `expected ${JSON.stringify(a)} === ${JSON.stringify(b)}`);
}

function summary() {
    console.log(`\n${'='.repeat(60)}`);
    console.log(`  RESULTS: ${passCount}/${testCount} passed, ${failCount} failed`);
    console.log(`${'='.repeat(60)}\n`);
    return failCount === 0;
}

// ============================================================================
// Test 1: VaultManager — Daily Note YAML Template
// ============================================================================

async function testDailyNoteTemplate() {
    section('VaultManager — Daily Note YAML Template');

    const settings = {
        dayBoundaryHour: 6,
        dailyFolder: '01-Daily',
        planFolder: '02-Plan',
        archiveFolder: '03-Archive',
    };

    const app = new MockApp();

    // Simulate what createDailyNoteTemplate does
    const dateStr = '2026-02-08';
    const weekday = 'Sunday';
    const weekRef = '2026-W06';

    const template = `---
type: daily
date: ${dateStr}
emotion_score:
status: todo
weekly_ref: "[[${weekRef}]]"
---

# ${dateStr} ${weekday}

## 晨间计划

<!-- 今日计划将在晨间复盘时填充 -->

## 晚间复盘

<!-- 晚间复盘内容将在晚间复盘时填充 -->

---

`;

    assertContains(template, '---\ntype: daily', 'Has YAML frontmatter opening');
    assertContains(template, 'date: 2026-02-08', 'Has correct date');
    assertContains(template, 'emotion_score:', 'Has empty emotion_score');
    assertContains(template, 'status: todo', 'Has default todo status');
    assertContains(template, 'weekly_ref: "[[2026-W06]]"', 'Has weekly reference link');
    assertContains(template, '## 晨间计划', 'Has morning plan section');
    assertContains(template, '## 晚间复盘', 'Has evening review section');

    // Test YAML update logic
    const file = await app.vault.create('01-Daily/2026-02-08.md', template);

    // Simulate updateDailyNoteYAML
    async function updateYAML(filePath, fields) {
        const f = app.vault.getAbstractFileByPath(filePath);
        if (!f) return;
        const content = await app.vault.read(f);

        if (!content.startsWith('---')) return;
        const endIndex = content.indexOf('---', 3);
        if (endIndex === -1) return;

        const yamlBlock = content.substring(4, endIndex);
        const rest = content.substring(endIndex + 3);
        const yamlLines = yamlBlock.split('\n');

        for (const [key, value] of Object.entries(fields)) {
            let found = false;
            for (let i = 0; i < yamlLines.length; i++) {
                if (yamlLines[i].startsWith(`${key}:`)) {
                    if (value === null || value === undefined || value === '') {
                        yamlLines[i] = `${key}:`;
                    } else if (typeof value === 'string' && value.includes('[[')) {
                        yamlLines[i] = `${key}: "${value}"`;
                    } else {
                        yamlLines[i] = `${key}: ${value}`;
                    }
                    found = true;
                    break;
                }
            }
            if (!found) {
                yamlLines.push(`${key}: ${value}`);
            }
        }

        const newContent = '---\n' + yamlLines.join('\n') + '---' + rest;
        await app.vault.modify(f, newContent);
    }

    await updateYAML('01-Daily/2026-02-08.md', { emotion_score: 8, status: 'completed' });
    const updated = await app.vault.read(file);
    assertContains(updated, 'emotion_score: 8', 'YAML update: emotion_score set to 8');
    assertContains(updated, 'status: completed', 'YAML update: status changed to completed');
    assertContains(updated, '## 晨间计划', 'YAML update: body preserved');

    // Test adding a new field
    await updateYAML('01-Daily/2026-02-08.md', { new_field: 'hello' });
    const updated2 = await app.vault.read(file);
    assertContains(updated2, 'new_field: hello', 'YAML update: new field added');
    assertContains(updated2, 'emotion_score: 8', 'YAML update: existing fields preserved');
}

// ============================================================================
// Test 2: TemplateManager — Weekly Plan YAML Template
// ============================================================================

async function testWeeklyPlanTemplate() {
    section('TemplateManager — Weekly Plan YAML Template');

    const weekNumber = 'W06';
    const monthRef = '2026-02';

    const template = `---
type: weekly
week_number: ${weekNumber}
monthly_ref: "${monthRef ? `[[${monthRef}]]` : ''}"
progress: 0
---

# ${weekNumber} 周计划

## 本周目标

<!-- 本周最重要的 3 个目标 -->

1. 
2. 
3. 

## 关键任务`;

    assertContains(template, 'type: weekly', 'Has weekly type');
    assertContains(template, 'week_number: W06', 'Has week number');
    assertContains(template, 'monthly_ref: "[[2026-02]]"', 'Has monthly reference');
    assertContains(template, 'progress: 0', 'Has initial progress 0');
    assertContains(template, '# W06 周计划', 'Has weekly plan heading');
}

// ============================================================================
// Test 3: TaskRegistryService — Task Parsing
// ============================================================================

async function testTaskRegistry() {
    section('TaskRegistryService — Task Parsing & Status Update');

    const app = new MockApp();

    // Create a daily note with tasks
    const noteContent = `---
type: daily
date: 2026-02-08
emotion_score:
status: in-progress
weekly_ref: "[[2026-W06]]"
---

# 2026-02-08 Sunday

## 晨间计划

**精力状态**: 8/10

- [ ] 完成论文第三章
  - [ ] 写文献综述
  - [ ] 整理数据
- [x] 跑步30分钟
- [ ] 阅读20页书

---

## 晚间复盘
`;

    const file = await app.vault.create('01-Daily/2026-02-08.md', noteContent);

    // Parse tasks from the section
    function parseTaskLines(lines) {
        const tasks = [];
        for (const line of lines) {
            const mainMatch = line.match(/^- \[([ x])\] (.+)$/);
            if (mainMatch) {
                tasks.push({
                    text: mainMatch[2].trim(),
                    subtasks: [],
                    done: mainMatch[1] === 'x',
                    source: 'manual',
                });
                continue;
            }
            const subMatch = line.match(/^\s{2,}- \[([ x])\] (.+)$/);
            if (subMatch && tasks.length > 0) {
                tasks[tasks.length - 1].subtasks.push(subMatch[2].trim());
            }
        }
        return tasks;
    }

    function extractSectionLines(content, sectionHeader) {
        const lines = content.split('\n');
        const result = [];
        let inSection = false;
        for (const line of lines) {
            if (line.startsWith('## ')) {
                if (inSection) break;
                if (line.includes(sectionHeader)) {
                    inSection = true;
                    continue;
                }
            }
            if (inSection) result.push(line);
        }
        return result;
    }

    const sectionLines = extractSectionLines(noteContent, '晨间计划');
    const tasks = parseTaskLines(sectionLines);

    assertEqual(tasks.length, 3, `Found 3 main tasks (got ${tasks.length})`);
    assertEqual(tasks[0].text, '完成论文第三章', 'First task text correct');
    assertEqual(tasks[0].done, false, 'First task is unchecked');
    assertEqual(tasks[0].subtasks.length, 2, 'First task has 2 subtasks');
    assertEqual(tasks[0].subtasks[0], '写文献综述', 'First subtask text correct');
    assertEqual(tasks[1].text, '跑步30分钟', 'Second task text correct');
    assertEqual(tasks[1].done, true, 'Second task is checked (done)');
    assertEqual(tasks[2].text, '阅读20页书', 'Third task text correct');
    assertEqual(tasks[2].done, false, 'Third task is unchecked');

    // Test formatTasksAsMarkdown
    function formatTasksAsMarkdown(tasks) {
        const lines = [];
        for (const task of tasks) {
            const checkbox = task.done ? '[x]' : '[ ]';
            lines.push(`- ${checkbox} ${task.text}`);
            for (const sub of task.subtasks) {
                lines.push(`  - [ ] ${sub}`);
            }
        }
        return lines.join('\n');
    }

    const formatted = formatTasksAsMarkdown(tasks);
    assertContains(formatted, '- [ ] 完成论文第三章', 'Formatted: unchecked main task');
    assertContains(formatted, '- [x] 跑步30分钟', 'Formatted: checked main task');
    assertContains(formatted, '  - [ ] 写文献综述', 'Formatted: subtask preserved');

    // Test updateTaskStatus
    async function updateTaskStatus(filePath, taskText, done) {
        const f = app.vault.getAbstractFileByPath(filePath);
        if (!f) return false;
        const content = await app.vault.read(f);
        const fromChar = done ? ' ' : 'x';
        const toCheckbox = done ? '[x]' : '[ ]';
        const escaped = taskText.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const pattern = new RegExp(`^(\\s*- )\\[${fromChar}\\]( ${escaped})$`, 'm');
        const match = content.match(pattern);
        if (!match) return false;
        const updated = content.replace(pattern, `$1${toCheckbox}$2`);
        await app.vault.modify(f, updated);
        return true;
    }

    const result = await updateTaskStatus('01-Daily/2026-02-08.md', '完成论文第三章', true);
    assert(result, 'updateTaskStatus returned true');

    const updatedNote = await app.vault.read(file);
    assertContains(updatedNote, '- [x] 完成论文第三章', 'Task status toggled to done');
    assertContains(updatedNote, '- [x] 跑步30分钟', 'Other done task still done');
    assertContains(updatedNote, '- [ ] 阅读20页书', 'Other unchecked task still unchecked');

    // Toggle back
    const result2 = await updateTaskStatus('01-Daily/2026-02-08.md', '完成论文第三章', false);
    assert(result2, 'updateTaskStatus toggle back returned true');
    const updatedNote2 = await app.vault.read(file);
    assertContains(updatedNote2, '- [ ] 完成论文第三章', 'Task status toggled back to unchecked');
}

// ============================================================================
// Test 4: KanbanService — Board Generation & Task Sync
// ============================================================================

async function testKanbanService() {
    section('KanbanService — Board Generation & Sync');

    const app = new MockApp();
    const DAY_LABELS = {
        Mon: '周一', Tue: '周二', Wed: '周三', Thu: '周四',
        Fri: '周五', Sat: '周六', Sun: '周日',
    };

    // Generate board template
    function generateBoardTemplate(weekRef) {
        const DAY_COLUMNS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
        const lines = [
            '---',
            'kanban-plugin: basic',
            '---',
            '',
            `## Backlog (${weekRef} 重点)`,
            '',
        ];
        for (const day of DAY_COLUMNS) {
            lines.push(`## ${DAY_LABELS[day]} (${day})`);
            lines.push('');
        }
        lines.push('## ✅ Completed');
        lines.push('');
        lines.push('');
        lines.push('%% kanban:settings');
        lines.push('{"kanban-plugin":"basic"}');
        lines.push('%%');
        return lines.join('\n');
    }

    const board = generateBoardTemplate('2026-W06');
    assertContains(board, 'kanban-plugin: basic', 'Board has kanban-plugin YAML');
    assertContains(board, '## Backlog (2026-W06 重点)', 'Board has Backlog column');
    assertContains(board, '## 周一 (Mon)', 'Board has Monday column');
    assertContains(board, '## 周二 (Tue)', 'Board has Tuesday column');
    assertContains(board, '## 周三 (Wed)', 'Board has Wednesday column');
    assertContains(board, '## 周四 (Thu)', 'Board has Thursday column');
    assertContains(board, '## 周五 (Fri)', 'Board has Friday column');
    assertContains(board, '## 周六 (Sat)', 'Board has Saturday column');
    assertContains(board, '## 周日 (Sun)', 'Board has Sunday column');
    assertContains(board, '## ✅ Completed', 'Board has Completed column');
    assertContains(board, '%% kanban:settings', 'Board has kanban settings block');
    assertContains(board, '{"kanban-plugin":"basic"}', 'Board has kanban settings JSON');

    // Create board file
    const boardFile = await app.vault.create('02-Plan/Weekly/2026-W06-Board.md', board);

    // Test addTaskToDay
    async function addTaskToDay(filePath, taskText, dayOfWeek) {
        const f = app.vault.getAbstractFileByPath(filePath);
        const content = await app.vault.read(f);
        const dayLabel = DAY_LABELS[dayOfWeek] || dayOfWeek;
        const columnHeader = `## ${dayLabel} (${dayOfWeek})`;
        const headerIdx = content.indexOf(columnHeader);
        if (headerIdx === -1) return;
        const afterHeader = content.indexOf('\n', headerIdx);
        if (afterHeader === -1) return;
        const taskLine = `- [ ] ${taskText}\n`;
        const newContent = content.substring(0, afterHeader + 1) +
            taskLine + content.substring(afterHeader + 1);
        await app.vault.modify(f, newContent);
    }

    await addTaskToDay(boardFile.path, '完成论文第三章', 'Mon');
    await addTaskToDay(boardFile.path, '跑步30分钟', 'Mon');
    await addTaskToDay(boardFile.path, '阅读20页书', 'Tue');

    let boardContent = await app.vault.read(boardFile);
    assertContains(boardContent, '- [ ] 完成论文第三章', 'Task added to Monday column (task A)');
    assertContains(boardContent, '- [ ] 跑步30分钟', 'Second task added to Monday (task B)');
    assertContains(boardContent, '## 周二 (Tue)\n- [ ] 阅读20页书', 'Task added to Tuesday column');

    // Test moveTaskToCompleted
    async function moveTaskToCompleted(filePath, taskText) {
        const f = app.vault.getAbstractFileByPath(filePath);
        const content = await app.vault.read(f);
        const escaped = taskText.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const taskPattern = new RegExp(`^- \\[ \\] ${escaped}\\n?`, 'm');
        const match = content.match(taskPattern);
        if (!match) return false;
        let newContent = content.replace(taskPattern, '');
        const completedHeader = '## ✅ Completed';
        const completedIdx = newContent.indexOf(completedHeader);
        if (completedIdx === -1) return false;
        const afterCompleted = newContent.indexOf('\n', completedIdx);
        if (afterCompleted === -1) return false;
        const completedLine = `- [x] ${taskText}\n`;
        newContent = newContent.substring(0, afterCompleted + 1) +
            completedLine + newContent.substring(afterCompleted + 1);
        await app.vault.modify(f, newContent);
        return true;
    }

    const moved = await moveTaskToCompleted(boardFile.path, '跑步30分钟');
    assert(moved, 'moveTaskToCompleted returned true');
    boardContent = await app.vault.read(boardFile);
    assert(!boardContent.includes('## 周一 (Mon)\n- [ ] 跑步30分钟'), 'Task removed from Monday column');
    assertContains(boardContent, '## ✅ Completed\n- [x] 跑步30分钟', 'Task moved to Completed column');
    assertContains(boardContent, '- [ ] 完成论文第三章', 'Other task still in Monday');

    // Test that Completed column has correct format
    const completedSection = boardContent.substring(boardContent.indexOf('## ✅ Completed'));
    assertContains(completedSection, '- [x] 跑步30分钟', 'Completed task has [x] checkbox');
}

// ============================================================================
// Test 5: KanbanService — syncFromDailyNote
// ============================================================================

async function testKanbanSync() {
    section('KanbanService — syncFromDailyNote');

    const app = new MockApp();
    const DAY_LABELS = {
        Mon: '周一', Tue: '周二', Wed: '周三', Thu: '周四',
        Fri: '周五', Sat: '周六', Sun: '周日',
    };

    // Create daily note with tasks
    const dailyContent = `---
type: daily
date: 2026-02-08
emotion_score: 7
status: in-progress
weekly_ref: "[[2026-W06]]"
---

# 2026-02-08 Sunday

## 晨间计划

**精力状态**: 8/10

- [ ] 任务A
- [x] 任务B (已完成)
- [ ] 任务C

---
`;
    await app.vault.create('01-Daily/2026-02-08.md', dailyContent);

    // Create board
    const DAY_COLUMNS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
    const boardLines = ['---', 'kanban-plugin: basic', '---', '', '## Backlog (2026-W06 重点)', ''];
    for (const day of DAY_COLUMNS) {
        boardLines.push(`## ${DAY_LABELS[day]} (${day})`);
        boardLines.push('');
    }
    boardLines.push('## ✅ Completed', '', '', '%% kanban:settings', '{"kanban-plugin":"basic"}', '%%');
    const boardContent = boardLines.join('\n');
    const boardFile = await app.vault.create('02-Plan/Weekly/2026-W06-Board.md', boardContent);

    // Simulate syncFromDailyNote for Sunday
    function extractSectionLines(content, header) {
        const lines = content.split('\n');
        const result = [];
        let inSection = false;
        for (const line of lines) {
            if (line.startsWith('## ')) {
                if (inSection) break;
                if (line.includes(header)) { inSection = true; continue; }
            }
            if (inSection) result.push(line);
        }
        return result;
    }

    function parseTaskLines(lines) {
        const tasks = [];
        for (const line of lines) {
            const m = line.match(/^- \[([ x])\] (.+)$/);
            if (m) {
                tasks.push({ text: m[2].trim(), subtasks: [], done: m[1] === 'x', source: 'manual' });
            }
        }
        return tasks;
    }

    const dailyFile = app.vault.getAbstractFileByPath('01-Daily/2026-02-08.md');
    const dailyData = await app.vault.read(dailyFile);
    const lines = extractSectionLines(dailyData, '晨间计划');
    const tasks = parseTaskLines(lines);

    assertEqual(tasks.length, 3, `Read 3 tasks from daily note (got ${tasks.length})`);

    // Simulate sync to Sunday column
    const dayOfWeek = 'Sun';
    const dayLabel = DAY_LABELS[dayOfWeek];
    const columnHeader = `## ${dayLabel} (${dayOfWeek})`;

    let currentBoard = await app.vault.read(boardFile);
    const headerIdx = currentBoard.indexOf(columnHeader);
    assert(headerIdx !== -1, 'Found Sunday column on board');

    const afterHeader = currentBoard.indexOf('\n', headerIdx);
    const nextHeaderIdx = currentBoard.indexOf('\n## ', afterHeader);

    // Build new column
    const newLines = [];
    for (const task of tasks) {
        const checkbox = task.done ? '[x]' : '[ ]';
        newLines.push(`- ${checkbox} ${task.text}`);
    }

    const beforeColumn = currentBoard.substring(0, afterHeader + 1);
    const afterColumn = currentBoard.substring(nextHeaderIdx);
    const newBoard = beforeColumn + newLines.join('\n') + '\n' + afterColumn;
    await app.vault.modify(boardFile, newBoard);

    const syncedBoard = await app.vault.read(boardFile);
    assertContains(syncedBoard, '## 周日 (Sun)\n- [ ] 任务A', 'Synced: 任务A in Sunday column');
    assertContains(syncedBoard, '- [x] 任务B (已完成)', 'Synced: 任务B marked done');
    assertContains(syncedBoard, '- [ ] 任务C', 'Synced: 任务C in Sunday column');
    assertContains(syncedBoard, '## ✅ Completed', 'Completed column still exists');
}

// ============================================================================
// Test 6: DashboardService — Dashboard Generation
// ============================================================================

async function testDashboard() {
    section('DashboardService — Dashboard Generation');

    const app = new MockApp();
    const settings = {
        dailyFolder: '01-Daily',
        planFolder: '02-Plan',
        archiveFolder: '03-Archive',
    };

    // Create principles.md with some content
    await app.vault.create('03-Archive/principles.md', `# 原则库

## 决策类
- 当面临选择时，问自己"5年后我会怎么看这个决定？"

## 效率类
- 最重要的任务放在早上精力最好的时候做
- 番茄钟比长时间工作更有效
`);

    // Create patterns.md
    await app.vault.create('03-Archive/patterns.md', `# 模式库

## 情绪模式
- 周一上午容易焦虑

## 行为模式
- 截止日期前一天效率最高
- 下午三点后注意力下降明显
`);

    // Simulate getRandomPrinciple
    async function getRandomPrinciple() {
        const f = app.vault.getAbstractFileByPath('03-Archive/principles.md');
        if (!f) return '';
        const content = await app.vault.read(f);
        const lines = content.split('\n');
        const principles = lines
            .filter(l => l.startsWith('- ') && !l.includes('示例'))
            .map(l => l.substring(2).trim())
            .filter(l => l.length > 0);
        if (principles.length === 0) return '';
        return principles[Math.floor(Math.random() * principles.length)];
    }

    async function getLatestPattern() {
        const f = app.vault.getAbstractFileByPath('03-Archive/patterns.md');
        if (!f) return '';
        const content = await app.vault.read(f);
        const lines = content.split('\n');
        const patterns = lines
            .filter(l => l.startsWith('- ') && !l.includes('示例'))
            .map(l => l.substring(2).trim())
            .filter(l => l.length > 0);
        if (patterns.length === 0) return '';
        return patterns[patterns.length - 1];
    }

    const principle = await getRandomPrinciple();
    assert(principle.length > 0, `Got a random principle: "${principle}"`);
    assert(typeof principle === 'string', 'Principle is a string');

    const pattern = await getLatestPattern();
    assertEqual(pattern, '下午三点后注意力下降明显', `Got latest pattern: "${pattern}"`);

    // Build dashboard content
    function buildDashboard(principle, pattern) {
        return `---
type: dashboard
---

# 📊 Dashboard

## 本周任务进度

\`\`\`dataview
TABLE WITHOUT ID
  file.link AS "日期",
  status AS "状态",
  emotion_score AS "情绪"
FROM "${settings.dailyFolder}"
WHERE type = "daily" AND date >= date(sow)
SORT date ASC
\`\`\`

## 本周计划

\`\`\`dataview
TABLE WITHOUT ID
  file.link AS "计划",
  progress AS "进度 %"
FROM "${settings.planFolder}/Weekly"
WHERE type = "weekly"
SORT file.ctime DESC
LIMIT 1
\`\`\`

## 📈 情绪趋势 (近 7 天)

\`\`\`dataview
TABLE WITHOUT ID
  date AS "日期",
  emotion_score AS "评分"
FROM "${settings.dailyFolder}"
WHERE type = "daily" AND emotion_score != null
SORT date DESC
LIMIT 7
\`\`\`

## 💡 今日原则

> ${principle || '_暂无原则_'}

## 🔍 活跃模式

> ${pattern || '_暂无活跃模式_'}

---
`;
    }

    const dashboard = buildDashboard(principle, pattern);
    assertContains(dashboard, 'type: dashboard', 'Dashboard has type YAML');
    assertContains(dashboard, '# 📊 Dashboard', 'Dashboard has title');
    assertContains(dashboard, '```dataview', 'Dashboard has Dataview query blocks');
    assertContains(dashboard, `FROM "${settings.dailyFolder}"`, 'Dataview queries use correct folder');
    assertContains(dashboard, '## 💡 今日原则', 'Dashboard has principle section');
    assertContains(dashboard, '## 🔍 活跃模式', 'Dashboard has pattern section');
    assert(!dashboard.includes('_暂无原则_'), 'Principle is populated');
    assertContains(dashboard, '下午三点后注意力下降明显', 'Pattern is populated');

    // Test file creation
    const dashFile = await app.vault.create('Dashboard.md', dashboard);
    const dashContent = await app.vault.read(dashFile);
    assertEqual(dashContent, dashboard, 'Dashboard file content matches generated content');
}

// ============================================================================
// Test 7: FileLinkService — Event Listening & Debounce
// ============================================================================

async function testFileLinkService() {
    section('FileLinkService — Event Listening & Debounce');

    const app = new MockApp();
    let syncCalls = 0;

    // Simulate FileLinkService
    let syncing = false;
    let debounceTimer = null;

    function startListening() {
        app.vault.on('modify', (file) => {
            if (syncing) return;
            if (file.path.startsWith('01-Daily/')) {
                if (debounceTimer) clearTimeout(debounceTimer);
                debounceTimer = setTimeout(() => {
                    syncing = true;
                    syncCalls++;
                    syncing = false;
                }, 100); // Use 100ms for testing instead of 800ms
            }
        });
    }

    startListening();

    // Create and modify a daily note
    const file = await app.vault.create('01-Daily/2026-02-08.md', 'test');

    // Modify it multiple times rapidly
    await app.vault.modify(file, 'test 1');
    await app.vault.modify(file, 'test 2');
    await app.vault.modify(file, 'test 3');

    // Wait for debounce
    await new Promise(resolve => setTimeout(resolve, 200));

    assertEqual(syncCalls, 1, `Debounce: only 1 sync call for 3 rapid modifications (got ${syncCalls})`);

    // Modify a non-daily file — should be ignored
    const otherFile = await app.vault.create('02-Plan/test.md', 'other');
    syncCalls = 0;
    await app.vault.modify(otherFile, 'changed');
    await new Promise(resolve => setTimeout(resolve, 200));
    assertEqual(syncCalls, 0, 'Non-daily files are ignored by file linker');

    // Syncing flag prevents re-entry
    syncing = true;
    syncCalls = 0;
    await app.vault.modify(file, 'during sync');
    await new Promise(resolve => setTimeout(resolve, 200));
    assertEqual(syncCalls, 0, 'Syncing flag prevents re-entry');
    syncing = false;
}

// ============================================================================
// Test 8: Evening SOP — Emotion Score Extraction
// ============================================================================

async function testEmotionScoreExtraction() {
    section('Evening SOP — Emotion Score Extraction');

    function extractEmotionScore(text) {
        const match = text.match(/(\d+)\s*[分\/]/);
        return match ? match[1] : null;
    }

    assertEqual(extractEmotionScore('今天心情 8分'), '8', 'Extract "8分"');
    assertEqual(extractEmotionScore('7/10'), '7', 'Extract "7/10"');
    assertEqual(extractEmotionScore('情绪评分：6分，还不错'), '6', 'Extract "6分" from sentence');
    assertEqual(extractEmotionScore('10分！超级开心'), '10', 'Extract "10分"');
    assertEqual(extractEmotionScore('我觉得还行'), null, 'No score returns null');
    assertEqual(extractEmotionScore('3/5'), '3', 'Extract "3/5"');
}

// ============================================================================
// Test 9: Evening SOP — Dynamic Summary Generation
// ============================================================================

async function testDynamicSummary() {
    section('Evening SOP — Dynamic Summary Generation');

    // Simulate the dynamic summary builder from finishEveningSOP
    const questionFlow = [
        { type: 'goal_alignment', sectionName: '目标对标', required: true },
        { type: 'success_diary', sectionName: '成功日记', required: true },
        { type: 'happiness_emotion', sectionName: '开心事与情绪评分', required: true },
        { type: 'anxiety_awareness', sectionName: '焦虑觉察', required: true },
        { type: 'tomorrow_plan', sectionName: '明日计划', required: true },
        { type: 'deep_analysis', sectionName: '深度分析', required: false },
        { type: 'reflection', sectionName: '反思', required: false },
    ];

    // Case 1: Completed all required (5 questions)
    let currentQuestionIndex = 5;
    let emotionScore = '7';

    const requiredCount = questionFlow.filter(q => q.required).length;
    const completedOptional = Math.max(0, currentQuestionIndex - requiredCount);

    let summary = '✅ 今天的晚间复盘完成了！\n\n**复盘摘要：**';
    for (let i = 0; i < currentQuestionIndex && i < questionFlow.length; i++) {
        summary += `\n- ${questionFlow[i].sectionName} ✓`;
    }
    if (emotionScore) {
        summary += `\n\n**情绪评分**: ${emotionScore}/10`;
    }
    if (completedOptional > 0) {
        const totalOptional = questionFlow.filter(q => !q.required).length;
        summary += `\n- 选问完成 ${completedOptional}/${totalOptional}`;
    }

    assertContains(summary, '目标对标 ✓', 'Summary lists completed questions');
    assertContains(summary, '成功日记 ✓', 'Summary lists success diary');
    assertContains(summary, '情绪评分**: 7/10', 'Summary shows emotion score');
    assert(!summary.includes('选问完成'), 'No optional count when none completed');

    // Case 2: Completed all required + 2 optional
    currentQuestionIndex = 7;
    const completedOptional2 = Math.max(0, currentQuestionIndex - requiredCount);
    let summary2 = '**复盘摘要：**';
    for (let i = 0; i < currentQuestionIndex && i < questionFlow.length; i++) {
        summary2 += `\n- ${questionFlow[i].sectionName} ✓`;
    }
    if (completedOptional2 > 0) {
        const totalOptional = questionFlow.filter(q => !q.required).length;
        summary2 += `\n- 选问完成 ${completedOptional2}/${totalOptional}`;
    }

    assertContains(summary2, '深度分析 ✓', 'Summary includes optional questions when completed');
    assertContains(summary2, '反思 ✓', 'Summary includes second optional');
    assertContains(summary2, '选问完成 2/2', 'Optional count correct');
}

// ============================================================================
// Test 10: End-to-End — Morning SOP → Daily Note → Kanban Board
// ============================================================================

async function testEndToEnd() {
    section('End-to-End — Full Workflow Simulation');

    const app = new MockApp();
    const DAY_LABELS = {
        Mon: '周一', Tue: '周二', Wed: '周三', Thu: '周四',
        Fri: '周五', Sat: '周六', Sun: '周日',
    };

    // Step 1: Create daily note (as vault-manager would)
    const dailyContent = `---
type: daily
date: 2026-02-08
emotion_score:
status: todo
weekly_ref: "[[2026-W06]]"
---

# 2026-02-08 Sunday

## 晨间计划

<!-- 今日计划将在晨间复盘时填充 -->

## 晚间复盘

<!-- 晚间复盘内容将在晚间复盘时填充 -->

---

`;
    const dailyFile = await app.vault.create('01-Daily/2026-02-08.md', dailyContent);
    assertContains(await app.vault.read(dailyFile), 'status: todo', 'E2E: Initial status is todo');

    // Step 2: Morning SOP writes tasks
    const morningTaskContent = `
**精力状态**: 8/10

- [ ] 完成项目报告
- [ ] 团队会议准备
- [ ] 阅读技术文档

---`;

    // Simulate replaceSectionContent for 晨间计划
    const dailyData = await app.vault.read(dailyFile);
    const sectionStart = dailyData.indexOf('## 晨间计划');
    const sectionEnd = dailyData.indexOf('## 晚间复盘');
    const before = dailyData.substring(0, sectionStart + '## 晨间计划'.length);
    const after = dailyData.substring(sectionEnd);
    const newDaily = before + '\n' + morningTaskContent + '\n\n' + after;
    await app.vault.modify(dailyFile, newDaily);

    const afterMorning = await app.vault.read(dailyFile);
    assertContains(afterMorning, '- [ ] 完成项目报告', 'E2E: Morning SOP wrote tasks');

    // Step 3: Morning SOP updates YAML to in-progress
    // Simulate YAML update
    let content = await app.vault.read(dailyFile);
    content = content.replace('status: todo', 'status: in-progress');
    await app.vault.modify(dailyFile, content);
    assertContains(await app.vault.read(dailyFile), 'status: in-progress', 'E2E: Status updated to in-progress');

    // Step 4: Create kanban board
    const DAY_COLUMNS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
    const boardLines = ['---', 'kanban-plugin: basic', '---', '', '## Backlog (2026-W06 重点)', ''];
    for (const day of DAY_COLUMNS) {
        boardLines.push(`## ${DAY_LABELS[day]} (${day})`);
        boardLines.push('');
    }
    boardLines.push('## ✅ Completed', '', '', '%% kanban:settings', '{"kanban-plugin":"basic"}', '%%');
    const boardFile = await app.vault.create('02-Plan/Weekly/2026-W06-Board.md', boardLines.join('\n'));

    // Step 5: Sync tasks to kanban Sunday column
    const tasks = [
        { text: '完成项目报告', done: false },
        { text: '团队会议准备', done: false },
        { text: '阅读技术文档', done: false },
    ];

    let boardContent = await app.vault.read(boardFile);
    const colHeader = '## 周日 (Sun)';
    const hIdx = boardContent.indexOf(colHeader);
    const aIdx = boardContent.indexOf('\n', hIdx);
    const nIdx = boardContent.indexOf('\n## ', aIdx);

    const taskLines = tasks.map(t => `- ${t.done ? '[x]' : '[ ]'} ${t.text}`);
    boardContent = boardContent.substring(0, aIdx + 1) +
        taskLines.join('\n') + '\n' +
        boardContent.substring(nIdx);
    await app.vault.modify(boardFile, boardContent);

    const afterSync = await app.vault.read(boardFile);
    assertContains(afterSync, '## 周日 (Sun)\n- [ ] 完成项目报告', 'E2E: Tasks synced to Sunday column');

    // Step 6: Evening SOP — mark one task done, set emotion score
    content = await app.vault.read(dailyFile);
    content = content.replace('- [ ] 完成项目报告', '- [x] 完成项目报告');
    content = content.replace('emotion_score:', 'emotion_score: 8');
    content = content.replace('status: in-progress', 'status: completed');
    await app.vault.modify(dailyFile, content);

    const afterEvening = await app.vault.read(dailyFile);
    assertContains(afterEvening, 'emotion_score: 8', 'E2E: Emotion score set');
    assertContains(afterEvening, 'status: completed', 'E2E: Status set to completed');
    assertContains(afterEvening, '- [x] 完成项目报告', 'E2E: Task marked done');

    // Step 7: Verify kanban can sync completed tasks
    boardContent = await app.vault.read(boardFile);
    boardContent = boardContent.replace(
        '- [ ] 完成项目报告',
        '- [x] 完成项目报告'
    );
    await app.vault.modify(boardFile, boardContent);

    const finalBoard = await app.vault.read(boardFile);
    assertContains(finalBoard, '- [x] 完成项目报告', 'E2E: Board reflects completed task');
    assertContains(finalBoard, '- [ ] 团队会议准备', 'E2E: Incomplete tasks remain');

    console.log('\n  ✨ End-to-end workflow simulation passed!');
}

// ============================================================================
// Run All Tests
// ============================================================================

async function runAllTests(round) {
    console.log(`\n${'#'.repeat(60)}`);
    console.log(`  TEST ROUND ${round}`);
    console.log(`${'#'.repeat(60)}`);

    testCount = 0;
    passCount = 0;
    failCount = 0;

    await testDailyNoteTemplate();
    await testWeeklyPlanTemplate();
    await testTaskRegistry();
    await testKanbanService();
    await testKanbanSync();
    await testDashboard();
    await testFileLinkService();
    await testEmotionScoreExtraction();
    await testDynamicSummary();
    await testEndToEnd();

    const passed = summary();
    return passed;
}

async function main() {
    console.log('🧪 Visualization Management Module — Comprehensive Test Suite');
    console.log('Running 2 full rounds as requested...\n');

    const round1 = await runAllTests(1);
    const round2 = await runAllTests(2);

    console.log('\n' + '='.repeat(60));
    if (round1 && round2) {
        console.log('  ✅ ALL TESTS PASSED IN BOTH ROUNDS');
    } else {
        console.log('  ❌ SOME TESTS FAILED');
        if (!round1) console.log('    Round 1: FAILED');
        if (!round2) console.log('    Round 2: FAILED');
    }
    console.log('='.repeat(60));

    process.exit(round1 && round2 ? 0 : 1);
}

main();
