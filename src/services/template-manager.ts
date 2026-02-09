/**
 * Template Manager - Creates and manages template files
 */

import { App, TFile } from 'obsidian';
import { AIFlowSettings } from '../types';

export class TemplateManager {
    private app: App;
    private settings: AIFlowSettings;

    constructor(app: App, settings: AIFlowSettings) {
        this.app = app;
        this.settings = settings;
    }

    /**
     * Ensure all template files exist
     */
    async ensureTemplateFiles(): Promise<void> {
        await this.ensureUserProfile();
        await this.ensurePrinciples();
        await this.ensurePatterns();
    }

    /**
     * Create user_profile.md if it doesn't exist
     */
    private async ensureUserProfile(): Promise<void> {
        const path = `${this.settings.archiveFolder}/user_profile.md`;
        const exists = this.app.vault.getAbstractFileByPath(path);

        if (!exists) {
            const content = `# 用户画像

## 基本信息

<!-- 填写你的基本信息，帮助 AI 更好地理解你 -->

- **年龄段**: 
- **职业/角色**: 
- **生活阶段**: 

## 情绪特征

### 焦虑诱因
<!-- 什么事情容易让你感到焦虑？ -->

- 

### 开心诱因
<!-- 什么事情容易让你感到开心？ -->

- 

### 能量时段
<!-- 你一天中什么时候精力最充沛？ -->

- **高能量时段**: 
- **低能量时段**: 

## 成功模式

### 擅长的任务类型
<!-- 你在什么类型的任务上表现最好？ -->

- 

### 容易拖延的任务类型
<!-- 什么类型的任务你容易拖延？ -->

- 

### 激励方式
<!-- 什么能激励你行动？ -->

- 

## 思维倾向

<!-- 你倾向于分析思维还是直觉思维？乐观还是谨慎？ -->

- 

## 核心价值观

<!-- 你最看重什么？比如：成长、自由、家庭、健康等 -->

1. 
2. 
3. 

## 成长边界

### 舒适区
<!-- 你擅长且熟悉的领域 -->

- 

### 学习区
<!-- 你正在学习或想要发展的领域 -->

- 

### 恐慌区
<!-- 让你感到恐惧或抗拒的领域 -->

- 

---

> 这份画像会随着你的使用不断更新，AI 会根据你的日记内容提出更新建议。
`;
            await this.app.vault.create(path, content);
        }
    }

    /**
     * Create principles.md if it doesn't exist
     */
    private async ensurePrinciples(): Promise<void> {
        const path = `${this.settings.archiveFolder}/principles.md`;
        const exists = this.app.vault.getAbstractFileByPath(path);

        if (!exists) {
            const content = `# 原则库

> 这里记录你从经验中提炼出的人生原则。AI 会在晚间复盘时帮助你发现和提炼新原则。

## 决策类

<!-- 帮助你做出更好决策的原则 -->

- 示例：当面临选择时，问自己"5年后我会怎么看这个决定？"

## 情绪管理类

<!-- 帮助你管理情绪的原则 -->

- 示例：感到焦虑时，先问自己"这件事我能控制吗？"

## 效率类

<!-- 提高效率的原则 -->

- 示例：最重要的任务放在早上精力最好的时候做

## 人际关系类

<!-- 处理人际关系的原则 -->

- 示例：批评行为，不批评人格

## 健康类

<!-- 维护身心健康的原则 -->

- 示例：再忙也要保证7小时睡眠

## 通用

<!-- 其他类型的原则 -->

- 

---

> 原则应该是可操作的、具体的指导方针，而不是抽象的口号。
`;
            await this.app.vault.create(path, content);
        }
    }

    /**
     * Create patterns.md if it doesn't exist
     */
    private async ensurePatterns(): Promise<void> {
        const path = `${this.settings.archiveFolder}/patterns.md`;
        const exists = this.app.vault.getAbstractFileByPath(path);

        if (!exists) {
            const content = `# 模式库

> 这里记录 AI 从你的日记中发现的重复模式。识别模式是自我成长的第一步。

## 情绪模式

<!-- 情绪变化的规律 -->

- 示例：周一上午容易焦虑，通常与工作任务积压有关

## 行为模式

<!-- 行为习惯的规律 -->

- 示例：截止日期前一天效率最高

## 思维模式

<!-- 思维方式的规律 -->

- 示例：面对新挑战时，倾向于先想到困难而非机会

## 周期性规律

<!-- 周期性出现的现象 -->

- 示例：每月月底情绪低落，可能与月度压力有关

## 触发器

<!-- 导致特定反应的触发因素 -->

- 示例：收到批评邮件后容易陷入过度反刍

## 成功因素

<!-- 导致成功结果的共同因素 -->

- 示例：提前规划的项目完成质量明显更高

---

> AI 会在周/月洞察报告中分析你的模式，并提出改进建议。
`;
            await this.app.vault.create(path, content);
        }
    }

    /**
     * Get weekly plan template
     */
    getWeeklyPlanTemplate(weekNumber: string, monthRef?: string): string {
        const mRef = monthRef || '';
        return `---
type: weekly
week_number: ${weekNumber}
monthly_ref: "${mRef ? `[[${mRef}]]` : ''}"
progress: 0
---

# ${weekNumber} 周计划

## 本周目标

<!-- 本周最重要的目标和关键任务 -->

- [ ] 
- [ ] 
- [ ] 

## 回顾 (周末填写)

### 完成情况

- 

### 收获与感悟

- 

### 下周调整

- 

---
`;
    }

    /**
     * Get monthly plan template
     */
    getMonthlyPlanTemplate(yearMonth: string): string {
        return `# ${yearMonth} 月计划

## 本月主题

<!-- 用一句话概括本月的主题 -->



## 月度目标

<!-- 本月最重要的 3-5 个目标 -->

1. 
2. 
3. 

## 关键里程碑

<!-- 本月需要达成的关键里程碑 -->

- [ ] 第一周：
- [ ] 第二周：
- [ ] 第三周：
- [ ] 第四周：

## 成长重点

<!-- 本月想要重点发展的领域 -->

- 

## 月度回顾 (月底填写)

### 目标完成情况

- 

### 本月亮点

- 

### 经验教训

- 

### 下月展望

- 

---
`;
    }
}
