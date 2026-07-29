/**
 * Build a date-aligned Obsidian demo vault for TideLog.
 *
 * The content is deliberately synthetic. Re-running the script updates files
 * managed by this builder without deleting unrelated notes that a presenter
 * may have added to the demo vault.
 */

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, '..');
const vaultRoot = path.join(repoRoot, 'TideLog-Demo-Vault');
const checkOnly = process.argv.includes('--check');

const pad = (value) => String(value).padStart(2, '0');
const localDate = (year, monthIndex, day) => new Date(year, monthIndex, day, 12, 0, 0, 0);
const cloneDate = (date) => localDate(date.getFullYear(), date.getMonth(), date.getDate());
const addDays = (date, days) => {
    const next = cloneDate(date);
    next.setDate(next.getDate() + days);
    return next;
};
const startOfMonth = (date) => localDate(date.getFullYear(), date.getMonth(), 1);
const endOfMonth = (date) => localDate(date.getFullYear(), date.getMonth() + 1, 0);
const formatDate = (date) => `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
const monthKey = (date) => `${date.getFullYear()}-${pad(date.getMonth() + 1)}`;
const weekdayZh = (date) => ['星期日', '星期一', '星期二', '星期三', '星期四', '星期五', '星期六'][date.getDay()];

function isoWeekInfo(date) {
    const value = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
    const day = value.getUTCDay() || 7;
    value.setUTCDate(value.getUTCDate() + 4 - day);
    const yearStart = new Date(Date.UTC(value.getUTCFullYear(), 0, 1));
    const week = Math.ceil((((value - yearStart) / 86400000) + 1) / 7);
    return { year: value.getUTCFullYear(), week };
}

function startOfIsoWeek(date) {
    const result = cloneDate(date);
    const day = result.getDay() || 7;
    result.setDate(result.getDate() - day + 1);
    return result;
}

function endOfIsoWeek(date) {
    return addDays(startOfIsoWeek(date), 6);
}

function dateRange(start, end, weekdaysOnly = false) {
    const dates = [];
    let cursor = cloneDate(start);
    while (cursor <= end) {
        const weekday = cursor.getDay();
        if (!weekdaysOnly || (weekday !== 0 && weekday !== 6)) dates.push(cloneDate(cursor));
        cursor = addDays(cursor, 1);
    }
    return dates;
}

function ensureDir(relativePath) {
    fs.mkdirSync(path.join(vaultRoot, relativePath), { recursive: true });
}

function writeText(relativePath, content) {
    const absolutePath = path.join(vaultRoot, relativePath);
    fs.mkdirSync(path.dirname(absolutePath), { recursive: true });
    fs.writeFileSync(absolutePath, `${content.trim()}\n`, 'utf8');
}

function writeJson(relativePath, data) {
    writeText(relativePath, JSON.stringify(data, null, 2));
}

function copyIntoVault(sourceRelativePath, targetRelativePath) {
    const sourcePath = path.join(repoRoot, sourceRelativePath);
    const targetPath = path.join(vaultRoot, targetRelativePath);
    if (!fs.existsSync(sourcePath)) {
        throw new Error(`Missing build input: ${sourceRelativePath}. Run npm run build first.`);
    }
    fs.mkdirSync(path.dirname(targetPath), { recursive: true });
    fs.copyFileSync(sourcePath, targetPath);
}

const today = cloneDate(new Date());
const previousMonth = addDays(startOfMonth(today), -1);
const currentWeekStart = startOfIsoWeek(today);
const previousWeekStart = addDays(currentWeekStart, -7);
const previousWeekEnd = addDays(previousWeekStart, 6);
const demoProActivatedAt = Date.now();
const demoProExpiresAt = demoProActivatedAt + (7 * 24 * 60 * 60 * 1000);

const previousMonthDates = dateRange(startOfMonth(previousMonth), endOfMonth(previousMonth), true);
const currentMonthDates = dateRange(startOfMonth(today), today, true);
const dailyDates = [...previousMonthDates, ...currentMonthDates];

const taskSets = [
    {
        tasks: ['确认客户自助中心 Beta 的核心成功指标', '把本周需求拆成必须做与可以延后', '约设计和研发对齐 30 分钟'],
        win: '第一次把“按时上线”拆成了可判断的指标，团队对这周真正要守住什么更一致。',
        friction: '需求看起来都重要，删减范围时会担心遗漏，但不做取舍反而让每个人都在等待。',
        next: '先锁定 Beta 必须验证的两条路径，其余需求明确进入下一版本。',
        review: {
            alignment: '真正靠近目标的，不是又列了一张更长的需求表，而是终于说清楚 Beta 到底要验证什么。之前我总把“按时上线”挂在嘴边，今天才发现，如果成功标准都不清楚，按时也没什么意义。',
            success: '对齐快结束时，白板上原来的七个目标只剩下两个。删掉它们的时候我还是有点心虚，但看到设计和研发都能复述这周要守住什么，我突然松了一口气。',
            mood: '散会以后走去接水，脑子里难得没有一堆互相打架的需求。不是兴奋，更像是事情终于落到了地上。',
            anxiety: '讨论删范围时，我一直担心别人会不会觉得我考虑得不够完整，所以差点又把两个需求塞回来。现在想想，我害怕的其实不是遗漏，而是当那个说“不”的人。',
            tomorrow: '明早先把两条主路径写进需求首页。剩下的需求明确标成下一版本，不再用“有时间就做”给自己留口子。',
        },
    },
    {
        tasks: ['访谈 2 位最近提交过工单的客户', '整理他们卡住时使用的原话', '把一条关键反馈补进需求说明'],
        win: '客户说“我不是找不到入口，我是不确定操作后会发生什么”，这句话改变了页面提示的优先级。',
        friction: '访谈前担心问题问得不够专业，真正开始后发现认真追问比准备更多问题更有用。',
        next: '先把客户最不确定的结果反馈给设计，再决定是否增加新入口。',
        review: {
            alignment: '今天做的事看起来只是两场访谈，但它比继续讨论入口放在哪里更接近目标。用户卡住的原因和我们猜的不一样，这个差别值得尽快带回方案里。',
            success: '第二位客户说：“我不是找不到入口，我是不确定点完以后会发生什么。”听到这句话时我停了几秒，因为我们前两天还在讨论要不要再加一个入口。今天最有价值的可能就是这几秒。',
            mood: '访谈结束后有一点兴奋，也有一点被提醒后的惭愧。回办公室的路上我一直记着那句原话，觉得今天是真的从用户那里学到了东西。',
            anxiety: '开始前我很怕自己问得不专业，问题清单改了三遍。真正聊起来以后才发现，最有用的不是把问题问得漂亮，而是忍住不要急着解释我们的设计。',
            tomorrow: '先把那句客户原话放到设计稿旁边，再和设计一起看结果反馈。暂时不增加入口，除非新证据说明用户真的找不到。',
        },
    },
    {
        tasks: ['完成自助中心关键页面的设计评审', '确认错误状态与空状态是否齐全', '记录 3 个需要用户验证的假设'],
        win: '评审没有停在审美偏好，而是围绕客户能否完成任务逐项做了决定。',
        friction: '讨论一发散就容易追加功能，需要反复把大家拉回 Beta 的验证目标。',
        next: '把三个未确认假设写进测试清单，不在评审会上凭感觉定结论。',
        review: {
            alignment: '评审总算没有纠缠按钮放左还是放右，而是回到用户能不能看懂、能不能完成。离 Beta 目标近了一步，不过三个假设现在只是被写下来，还不能假装它们已经成立。',
            success: '评错误状态时，我问了一句：“用户现在会不会以为数据丢了？”会议安静了两秒，大家才意识到缺的不是另一个空状态，而是明确的结果反馈。我挺喜欢自己今天把讨论拉回用户的那一下。',
            mood: '散会时先是松了一口气，随后又觉得有点累。看到白板最后只剩三个需要验证的问题，还是有一种混乱终于被收住的踏实。',
            anxiety: '中间有人提议再做一个引导页，我第一反应又是“是不是也该做”，怕拒绝会显得我不重视建议。后来才意识到，我这种什么都想一起兜住的惯性，正是范围不断变大的原因。',
            tomorrow: '明早先把三个假设写成测试清单，每条补上负责人、证据和最晚确认时间。没有证据的地方先承认不知道，不在会上凭感觉补答案。',
        },
    },
    {
        tasks: ['和后端确认接口依赖与最晚交付时间', '为阻塞项补充负责人和下一检查点', '把延期风险同步给项目相关人'],
        win: '把“等接口”改成了明确负责人、时间点和降级方案，脑子里不用一直惦记这件事。',
        friction: '跨团队依赖没有回复时最容易焦虑，也会忍不住频繁刷新消息。',
        next: '上午只在约定检查点跟进一次；若仍阻塞，直接启用已经写好的降级方案。',
        review: {
            alignment: '接口本身今天没有突然变快，但项目比早上更可控了。至少现在我知道谁在处理、几点再确认，以及最坏情况下要舍掉哪一段，不用再靠不停催消息维持进度感。',
            success: '后端同学把最晚时间写进文档的那一刻，我明显松了口气。更重要的是我们一起定了降级方案，这让我第一次觉得“等接口”不是只能被动等。',
            mood: '下午的情绪比上午稳很多。上午每看到消息图标亮一下都以为有结果，后来把检查点写进日历，注意力才慢慢回到手上的事。',
            anxiety: '对方迟迟没回复时，我脑子里很快就演到了“整个 Beta 都要延期”。其实当时唯一确定的事实只是还没收到回复，我却把最坏结果提前过了一遍。',
            tomorrow: '明天只在约定时间跟进一次。到点仍没有结果，就按今天写好的降级方案走，不再一边等一边反复刷新。',
        },
    },
    {
        tasks: ['用 90 分钟无会议时间完成验收清单', '逐条走查客户提交与查询路径', '只记录阻断 Beta 的问题'],
        win: '关掉消息后一次走完了主路径，发现的问题比上午零散检查时更关键。',
        friction: '开始前总觉得要先回复几条消息才安心，结果真正推进工作的时间不断后移。',
        next: '明早继续先保留一个无消息时段，再集中处理协作信息。',
        review: {
            alignment: '验收清单还没有做到百分之百漂亮，但主路径终于被我从头到尾走了一遍。今天真正推进项目的，是那段没有会议、没有回复消息的九十分钟。',
            success: '关掉通知后大概二十分钟，我发现提交成功后的状态根本没有说清楚下一步。这个问题上午零零碎碎看了好几次都没注意到，完整走一遍反而一下就看见了。',
            mood: '那九十分钟里很安静，我久违地有一种只做一件事的踏实。结束时并不亢奋，就是很确定自己今天抓到了一个真正重要的问题。',
            anxiety: '开始前我还是先回了几条消息，总觉得别人等着会不高兴。结果一回就被带去处理了三个小问题，差点又把验收推到下午。',
            tomorrow: '明早先开九十分钟勿扰，把今天没走完的路径接着做。消息等到午前统一看，哪怕刚开始有点不舒服也先不破例。',
        },
    },
    {
        tasks: ['整理本轮可用性测试中的高频问题', '区分理解问题、操作问题和真实缺陷', '为前三个问题安排处理顺序'],
        win: '把六条零散反馈归成三类后，团队不再被每一条新消息带着改方向。',
        friction: '看到负面反馈时会下意识想马上修，但并不是每条反馈都代表同一种问题。',
        next: '先验证出现两次以上的问题，单次反馈保留观察，不立即扩大范围。',
        review: {
            alignment: '我今天没有立刻修掉所有反馈，但把六条问题分清楚以后，反而更接近解决真正的阻碍。至少我和团队现在知道哪些是理解问题、哪些是操作问题，哪些才是缺陷。',
            success: '我把六张便签拖成三组后，会议里的语气一下变了。大家不再围着最新那条负面反馈转，而是开始讨论哪一类问题已经重复出现。',
            mood: '整理完以后有一种桌面终于被收干净的轻松感。最开心的不是问题变少了，而是它们不再挤成一团让我觉得每件都必须马上处理。',
            anxiety: '第一条负面反馈出现时，我很想立刻改方案，像是不马上回应就说明我们做错了。停下来对比其他记录后才发现，那更像一个需要观察的信号，不是判决。',
            tomorrow: '明天我只验证重复出现两次以上的三类问题。单次反馈先留在观察区，除非它直接阻断主路径，否则不临时扩大范围。',
        },
    },
    {
        tasks: ['向业务负责人同步 Beta 当前进度', '用一页说明风险、选择与需要的决策', '确认下次同步前不新增例会'],
        win: '把长篇进度汇报改成“事实、风险、需要决策”，十分钟就拿到了明确结论。',
        friction: '害怕对方信息不足时会补太多背景，反而让真正需要决定的事情被淹没。',
        next: '下一次继续先写需要对方决定什么，再补最少必要背景。',
        review: {
            alignment: '今天最接近目标的不是把进度讲得很完整，而是拿到了一个明确决策。那十分钟让团队少了两天等待，比再开一场同步会有用得多。',
            success: '我第一次只带了一页纸去汇报：事实、风险、需要决定什么。讲到第十分钟，对方直接选了方案 B；以前我可能还在解释项目背景。',
            mood: '走出会议室时有点意外，也有点好笑，原来少讲一些并没有显得准备不足。那种轻松更像“终于不用证明我知道所有细节”。',
            anxiety: '会前我几次想把背景再补两页，担心对方追问时答不上来。现在回看，那股紧张来自我想一次性消除所有疑问，而不是这次决策真的需要那么多信息。',
            tomorrow: '把今天的一页结构留下来。下次同步先写清楚希望对方做什么决定，再补支撑这个决定所必需的事实。',
        },
    },
    {
        tasks: ['完成 Beta 上线前检查并标注负责人', '确认数据监控与回滚条件', '把未完成项移到明确日期'],
        win: '清单上每一项都有负责人和状态，终于不需要靠自己记住整个项目。',
        friction: '临近上线时会把所有未完成都当成紧急，容易忽略真正的阻断条件。',
        next: '只追踪会影响客户主路径或无法回滚的问题，其余按计划处理。',
        review: {
            alignment: '上线前的事情还是很多，但今天至少把“很多”拆成了能判断的清单。真正影响目标的只有主路径、监控和回滚三类，其他未完成不该自动升级成紧急。',
            success: '最后一个空着的负责人被填上名字时，我把一直开着的私人备忘录关了。那一刻才发现，我之前一直在用自己的脑子替整个项目做提醒系统。',
            mood: '今天没有特别开心，更多是安定。看着每一项旁边都有名字和状态，我终于敢在下班时不再默背还有什么没做。',
            anxiety: '临近上线，我看到任何未完成都会先紧一下，仿佛它们都可能拖垮项目。可认真看清单后，很多只是“不够完美”，并不是“不能上线”。',
            tomorrow: '明天只盯会阻断客户主路径、监控缺失或无法回滚的问题。其他事项回到原来的日期，不再因为临近上线全部提前。',
        },
    },
    {
        tasks: ['午休后散步 20 分钟', '把下午会议控制在两个以内', '记录今天精力明显变化的时段'],
        win: '下午三点没有像往常一样明显掉线，短暂离开屏幕比继续硬撑更有效。',
        friction: '忙的时候会觉得休息是在拖慢进度，但疲惫时处理协作问题更容易反复。',
        next: '继续保留午后短休息，把需要判断的工作放在上午完成。',
        review: {
            alignment: '散步看起来和 Beta 没关系，但下午没有像往常一样掉线，两个需要判断的会也没有来回反复。今天让我看到，保住精力其实也是在保项目质量。',
            success: '午饭后我真的下楼走了二十分钟，没有拿手机。回来时窗边那杯咖啡还是温的，下午三点也没有出现那种盯着同一行字看不进去的感觉。',
            mood: '今天最舒服的时刻是走到树荫下面，风比办公室里凉一点。不是很大的快乐，但身体先松下来以后，脑子也跟着安静了。',
            anxiety: '出门前我有点负罪感，觉得大家都在忙，我却去散步。可上午硬撑着回复消息时已经出现两次理解偏差，继续坐着并不等于更负责。',
            tomorrow: '明天午饭后继续离开屏幕二十分钟。需要判断的工作尽量放上午，下午只留两场真正需要我参加的会。',
        },
    },
    {
        tasks: ['完成本周 Review 并核对目标', '把未完成任务重新安排而不是复制', '为下周只保留 3 个关键结果'],
        win: '第一次不用翻遍聊天记录也能说清本周发生了什么，Daily Notes 里的证据已经足够。',
        friction: '周末复盘时容易只记得最后两天，前半周的小进展和压力来源会被忽略。',
        next: '下周继续每天留下一个事实和一个调整，让周复盘不再依赖记忆。',
        review: {
            alignment: '这周并不是所有事情都完成了，但主线比上周清楚。我能说出哪些动作真的推动了 Beta，也知道哪些只是忙着回应别人，这比把清单全部复制到下周更有用。',
            success: '写周复盘时，我第一次没有先去翻聊天记录。周一的取舍、周三的卡点和今天的调整都在日记里，原来每天留下两三句真的能把一周接起来。',
            mood: '回看这一周时有一点满足，也有一点疲惫。满足的是事情有痕迹，疲惫的是我终于看见自己有多少精力耗在“怕漏掉”上。',
            anxiety: '我还是很容易只记住最后两天，然后觉得前半周什么都没做。今天顺着记录往回看，才发现这种印象并不可靠，也会让我不必要地否定自己。',
            tomorrow: '下周只留三个关键结果。每天晚上继续写一个事实和一个调整，没完成的任务重新判断日期，不整段复制过去。',
        },
    },
];

const emotionScores = [7, 8, 6, 7, 8, 9, 7, 8];
const reviewOpeners = [
    '刚才把今天的任务重新扫了一遍。',
    '回家路上又把今天发生的事想了一遍。',
    '关电脑前看了一眼计划，发现自己最在意的并不是勾掉了几项。',
    '今晚写复盘比平时慢一点，因为不想最后只留下一句“做完了”。',
    '写到这里才发现，今天真正值得记住的不是清单本身。',
];
const completedTaskReflections = [
    '三件事都做完了，但完成并不代表里面的问题都已经解决。',
    '今天的三个勾都打上了，不过真正有用的是其中那一步判断。',
    '清单看起来是满的，我还是想分清哪些是推进，哪些只是按计划做完。',
    '任务都结束了，可我不想用“很顺利”把中间的犹豫盖过去。',
    '三件事都落下来了。比起完成数量，我更想记住是什么让事情往前走。',
];
const openTaskReflections = [
    '三件事只做完两件，剩下那项先诚实留着，不想为了让页面好看就把它勾掉。',
    '今天还留了一件没做完。现在看并不是不够努力，而是前两件比预想中更需要完整时间。',
    '清单上还有一个空框，但我不准备把它简单复制到明天，得先判断它还值不值得做。',
    '今天停在了二加一。那件未完成让我有点不舒服，不过它也提醒我最初的估时并不准确。',
    '有一项没有收尾，我先接受这个事实。比起赶在下班前仓促做完，留到重新判断更合适。',
];
const emotionScoreOpeners = [
    (score) => `如果一定要打分，今天大概是 ${score}/10。`,
    (score) => `今天我会给自己的情绪记 ${score}/10。`,
    (score) => `现在回头看，今天的情绪差不多是 ${score}/10。`,
    (score) => `今天先记成 ${score}/10 吧。`,
    (score) => `情绪大概在 ${score}/10，不算一个简单的“开心”或“不开心”。`,
];

function taskCompletionForIndex(index) {
    return index % 5 === 4 ? 2 : 3;
}

function metricsForPeriod(start, end) {
    const records = dailyDates
        .map((date, index) => ({ date, index }))
        .filter(({ date }) => date >= start && date <= end);
    const tasksTotal = records.length * 3;
    const tasksDone = records.reduce((sum, record) => sum + taskCompletionForIndex(record.index), 0);
    const emotionTotal = records.reduce(
        (sum, record) => sum + emotionScores[record.index % emotionScores.length],
        0,
    );
    const weeks = new Set(records.map(({ date }) => {
        const info = isoWeekInfo(date);
        return `${info.year}-W${pad(info.week)}`;
    })).size;

    return {
        records,
        loops: records.length,
        tasksTotal,
        tasksDone,
        tasksOpen: tasksTotal - tasksDone,
        completionRate: tasksTotal > 0 ? Math.round((tasksDone / tasksTotal) * 100) : 0,
        emotionAverage: records.length > 0 ? (emotionTotal / records.length).toFixed(1) : '0.0',
        weeks,
    };
}

function linkedEvidenceDate(taskSetIndex, dates = currentMonthDates) {
    const matching = dates
        .map((date) => ({
            date,
            index: dailyDates.findIndex((candidate) => formatDate(candidate) === formatDate(date)),
        }))
        .filter(({ index }) => index >= 0 && index % taskSets.length === taskSetIndex);
    const selected = matching.at(-1)?.date ?? dates.at(-1) ?? today;
    return `[[01-Daily/${formatDate(selected)}|${formatDate(selected)}]]`;
}

function dailyNote(date, index) {
    const item = taskSets[index % taskSets.length];
    const dateText = formatDate(date);
    const weekInfo = isoWeekInfo(date);
    const weekRef = `${weekInfo.year}-W${pad(weekInfo.week)}`;
    const completed = taskCompletionForIndex(index);
    const emotion = emotionScores[index % emotionScores.length];
    const taskLines = item.tasks.map((task, taskIndex) => `- [${taskIndex < completed ? 'x' : ' '}] ${task}`).join('\n');
    const loopLabel = completed === 3 ? '3/3' : '2/3';
    const voiceIndex = (index + Math.floor(index / taskSets.length)) % reviewOpeners.length;
    const taskReflection = completed === 3
        ? completedTaskReflections[voiceIndex]
        : openTaskReflections[voiceIndex];
    const emotionLead = emotionScoreOpeners[(index + 2) % emotionScoreOpeners.length](emotion);

    return `---
type: daily
date: ${dateText}
weekday: ${weekdayZh(date)}
tags:
  - daily
  - tidelog-demo
emotion_score: ${emotion}
status: completed
tasks_total: 3
tasks_done: ${completed}
weekly_ref: "[[${weekRef}]]"
monthly_ref: "[[${monthKey(date)}]]"
demo: true
---

# 🌊 ${date.getFullYear()}年${date.getMonth() + 1}月${date.getDate()}日 ${weekdayZh(date)}

> [!tl-overview] 今日概览
> 心情 ${emotion}/10　·　任务 ${loopLabel}　·　已闭环

> [!tl-day] 今日闭环
> 这里沉淀今天的计划、复盘和后续洞察依据。

## 计划

> [!tl-plan] 今日计划
> 把今天真正要推进的事写清楚，任务保持可执行。

${taskLines}

## 复盘

> [!tl-review] 今日复盘
> 记录事实、情绪、模式和一个可执行的调整。

> [!tl-review] 目标对标
> ${reviewOpeners[voiceIndex]}${taskReflection}
>
> ${item.review.alignment}

> [!tl-review] 成功日记
> ${item.review.success}

> [!tl-review] 开心事与情绪
> ${emotionLead}${item.review.mood}

> [!tl-review] 焦虑觉察
> ${item.review.anxiety}

> [!tl-review] 明日计划
> ${item.review.tomorrow}`;
}

function weeklyPlan(weekStart, index, isCurrent) {
    const weekEnd = endOfIsoWeek(weekStart);
    const weekInfo = isoWeekInfo(weekStart);
    const weekRef = `${weekInfo.year}-W${pad(weekInfo.week)}`;
    const progress = isCurrent ? 67 : 100;
    const currentRecords = isCurrent ? metricsForPeriod(weekStart, today).records : [];
    const discoveryWeek = currentRecords.filter(({ index: recordIndex }) => recordIndex % taskSets.length <= 2).length >= 2;
    const goals = discoveryWeek
        ? [
            '确认 Beta 成功指标，并把范围拆成必须做与可以延后',
            '完成 2 位客户访谈，把关键原话写进需求说明',
            '把设计评审中的 3 个假设转成可执行验证清单',
        ]
        : [
            '完成客户自助中心 Beta 的主路径验收',
            '解决前三个重复出现的可用性问题',
            '让所有上线风险都有负责人和检查点',
        ];
    const completionEvidence = discoveryWeek
        ? '成功指标、Beta 范围、客户访谈和设计评审已经完成；三个未确认假设仍需补充负责人、证据与检查点。'
        : '主路径验收和前三个可用性问题已完成；最终上线检查仍在进行。';
    const learning = discoveryWeek
        ? '客户原话进入评审后，团队更容易围绕“用户能否完成任务”做取舍；先写清验证目标，也能减少临时追加功能。'
        : '上午有连续专注时间时，执行类任务推进最快；跨团队依赖最容易制造焦虑，但写清负责人和下一检查点后，反复惦记明显减少。';
    const adjustment = discoveryWeek
        ? '接下来两天不扩展方案；为三个假设补齐负责人、证据和最晚检查点，无法在 Beta 周期验证的内容明确移到下一版本。'
        : '每天只保留 3 个关键任务；把协作消息集中到两个时段处理，上午优先完成需要判断和产出的工作。';

    return `---
type: weekly
week_number: ${weekRef}
monthly_ref: "[[${monthKey(weekStart)}]]"
progress: ${progress}
demo: true
---

# 🧭 ${weekRef} 周计划

> [!tl-meta] 周期
> ${formatDate(weekStart)} – ${formatDate(weekEnd)}

## 🎯 本周目标

> [!tl-plan] 本周主线
> 只保留真正决定本周质量的目标和关键任务。

${goals.map((goal, goalIndex) => `- [${!isCurrent || goalIndex < 2 ? 'x' : ' '}] ${goal}`).join('\n')}

## 🪞 回顾（周末填写）

> [!tl-review] 周末回顾
> 用事实、收获和下周调整完成闭环。

### 完成情况

> [!tl-evidence] 完成证据
> ${isCurrent ? completionEvidence : '完成本周计划中的关键结果，阻塞项均补充了负责人、检查点或降级方案。'}

### 收获与感悟

> [!tl-pattern] 收获与模式
> ${learning}

### 下周调整

> [!tl-experiment] 下周调整
> ${adjustment}`;
}

function monthlyPlan(date, isCurrent) {
    const key = monthKey(date);
    return `---
type: monthly
month: ${key}
progress: ${isCurrent ? 72 : 100}
demo: true
---

# 🧭 ${key} 月计划

## 🧭 本月主题

> [!tl-plan] 本月主线
> 让客户自助中心 Beta 稳定上线，同时找回不靠加班维持的工作节奏。

## 🎯 月度目标

> [!tl-plan] 月度目标
> 把本月收束到 3 个真正重要的结果。

- [x] 完成 Beta 核心路径、指标与范围确认
- [x] 用客户反馈解决前三个重复出现的问题
- [${isCurrent ? ' ' : 'x'}] 完成上线、监控与回滚准备

## 📍 关键里程碑

> [!tl-evidence] 关键里程碑
> 用里程碑让每周进展可见。

- [x] 第 1 周：确认 Beta 指标、范围与关键客户问题
- [x] 第 2 周：完成设计评审与跨团队依赖拆解
- [x] 第 3 周：完成可用性测试和主路径验收
- [${isCurrent ? ' ' : 'x'}] 第 4 周：完成上线检查、监控与回滚准备

## 🌱 成长重点

> [!tl-experiment] 成长实验
> 练习不靠即时回复维持安全感：上午保留专注时间，协作消息在约定检查点集中处理。

## 🪞 月度回顾（月底填写）

> [!tl-review] 月度回顾
> ${isCurrent ? '本月仍在进行中。最有效的改变，是把模糊的“推进项目”改写成每天可核对的结果。' : '项目关键里程碑按计划完成，也识别出跨团队依赖和碎片消息是主要压力来源。'}

### 目标完成情况

> [!tl-evidence] 目标完成证据
> ${isCurrent ? '核心路径和高频问题已完成，当前只剩上线检查与监控准备。' : '本月关键结果全部完成；所有阻塞项都有负责人、检查点或降级方案。'}

### 本月亮点

> [!tl-report] 本月亮点
> 一次客户访谈改变了页面提示的优先级，避免团队继续围绕错误假设增加入口。

### 经验教训

> [!tl-pattern] 经验模式
> 上午的连续专注时间适合产出和判断；下午更适合协作。把两者混在一起时，忙碌感上升但关键进度不明显。

### 下月展望

> [!tl-experiment] 下月调整
> 上线后每周只跟踪一个核心客户行为指标，并继续用 Daily Review 观察工作节奏是否可持续。`;
}

function weeklyInsight(weekStart, isCurrent = false) {
    const weekEnd = endOfIsoWeek(weekStart);
    const info = isoWeekInfo(weekStart);
    const dataEnd = isCurrent && today < weekEnd ? today : weekEnd;
    const metrics = metricsForPeriod(weekStart, dataEnd);
    const taskSetIndexes = metrics.records.map(({ index }) => index % taskSets.length);
    const discoverySignals = taskSetIndexes.filter((index) => index <= 2).length;
    const coordinationSignals = taskSetIndexes.filter((index) => index === 3 || index === 4).length;
    const narrative = discoverySignals >= Math.max(2, coordinationSignals)
        ? {
            judgmentTitle: '先把“按时上线”变成可验证的问题，团队才真正开始前进',
            judgment: '本周最重要的变化不是完成了多少需求，而是先锁定成功指标、必须做范围和三个待验证假设。客户原话进入计划后，设计评审也从偏好争论转向“用户能否完成任务”的证据讨论。',
            patternTitle: '客户证据让范围收束得更快',
            pattern: '先访谈、再评审，比先画完整方案更有效。客户对“操作后会发生什么”的不确定，直接改变了页面提示优先级；明确 Beta 只验证两条主路径后，团队更容易拒绝临时追加功能。',
            cautionTitle: '三天高完成率不等于上线风险已经解除',
            caution: '当前证据说明方向已经变清楚，但接口依赖、监控和回滚条件还没有在本周记录中闭环。现在最危险的误判，是把“方案达成一致”当成“关键路径已经可交付”。',
            experimentTitle: '把三个假设变成负责人、证据和检查点',
            experiment: '接下来两天不继续扩展方案。为三个待验证假设分别补上负责人、需要的证据和最晚检查点；任何无法在 Beta 周期验证的内容，明确移到下一版本。',
        }
        : {
            judgmentTitle: '从“忙了一整天”转向“关键路径有证据地前进”',
            judgment: '本周最重要的变化不是“处理了更多消息”，而是把项目推进从模糊的忙碌感变成了可核对的链条：**客户问题 → 今日关键任务 → 风险负责人 → 下一检查点**。Beta 是否在前进，开始由证据而不是感觉判断。',
            patternTitle: '清晰边界比更多投入更能推动完成',
            pattern: '需要独立判断和产出的任务，在上午保留连续时间时推进最快；跨团队协作若没有负责人和检查点，就会变成反复查看消息的心理负担。高完成率来自任务边界清楚，不是来自把日程排满。',
            cautionTitle: '团队都很忙，不等于关键路径正在前进',
            caution: '当前最值得警惕的不是做得不够多，而是把“所有人都很忙”误当成“关键路径正在前进”。现有证据来自个人记录，足以形成工作假设，但还不能替代团队层面的项目数据。',
            experimentTitle: '5 天消息批处理实验',
            experiment: '下周连续 5 个工作日把消息处理固定在午前和下班前两个时段；上午先完成唯一主任务。每天 Review 时只记录两件事：核心里程碑是否前进，以及焦虑是否因为少看消息而上升。',
        };
    const evidenceDates = metrics.records.length > 0
        ? [
            metrics.records[0],
            metrics.records[Math.floor(metrics.records.length / 2)],
            metrics.records.at(-1),
        ]
        : [
            { date: weekStart, index: 0 },
            { date: weekStart, index: 0 },
            { date: weekStart, index: 0 },
        ];

    return `# 🧭 ${info.year} · 第 ${info.week} 周洞察报告

> [!tl-meta] 报告信息
> 周期 ${formatDate(weekStart)} – ${formatDate(dataEnd)}　·　${metrics.loops} 个闭环　·　演示数据

## 1. 本周主判断

> [!tl-report] ${narrative.judgmentTitle}
> ${narrative.judgment}

## 2. 事实仪表盘

> [!tl-evidence] 用记录而不是印象判断
> - 闭环：**${metrics.loops}/${metrics.loops} 天**
> - 原生任务：**${metrics.tasksDone}/${metrics.tasksTotal} 完成（${metrics.completionRate}%）**
> - 平均情绪：**${metrics.emotionAverage}/10**
> - 未完成任务：**${metrics.tasksOpen} 条**，均保留在 Markdown 中作为下一步判断依据

## 3. 关键模式

> [!tl-pattern] ${narrative.patternTitle}
> ${narrative.pattern}

## 4. 张力与盲点

> [!tl-caution] ${narrative.cautionTitle}
> ${narrative.caution}

## 5. 下一步的小实验

> [!tl-experiment] ${narrative.experimentTitle}
> ${narrative.experiment}

## 6. 证据链

> [!tl-evidence] 可回到原文核对
> - [[01-Daily/${formatDate(evidenceDates[0].date)}|${taskSets[evidenceDates[0].index % taskSets.length].tasks[0]}]]
> - [[01-Daily/${formatDate(evidenceDates[1].date)}|${taskSets[evidenceDates[1].index % taskSets.length].tasks[0]}]]
> - [[01-Daily/${formatDate(evidenceDates[2].date)}|${taskSets[evidenceDates[2].index % taskSets.length].tasks[0]}]]
> - [[02-Plan/Weekly/${info.year}-W${pad(info.week)}|本周计划]]`;
}

function monthlyInsight(date, isCurrent = false) {
    const key = monthKey(date);
    const dataEnd = isCurrent && today < endOfMonth(date) ? today : endOfMonth(date);
    const metrics = metricsForPeriod(startOfMonth(date), dataEnd);
    const periodDates = dateRange(startOfMonth(date), dataEnd, true);

    return `# 🧭 ${date.getFullYear()}年${pad(date.getMonth() + 1)}月 · 洞察报告

> [!tl-meta] 报告信息
> 周期 ${formatDate(startOfMonth(date))} – ${formatDate(dataEnd)}　·　${metrics.loops} 个闭环　·　演示数据

## 1. 月度主判断

> [!tl-report] 真正的瓶颈不是任务太多，而是关键进度被碎片协作淹没
> ${isCurrent ? '截至目前，' : ''}这个月最重要的变化，是把“每天都很忙”拆成了三种不同事实：真正推动 Beta 的产出、需要别人响应的依赖、以及可以延后的噪音。记录开始帮助做取舍，而不是只保存一天发生过什么。

## 2. 月度仪表盘

> [!tl-evidence] ${metrics.weeks} 个自然周里的可验证事实
> - 完整闭环：**${metrics.loops} 天**
> - 原生任务：**${metrics.tasksDone}/${metrics.tasksTotal} 完成（${metrics.completionRate}%）**
> - 平均情绪：**${metrics.emotionAverage}/10**
> - 保留未完成：**${metrics.tasksOpen} 条**，没有为了“满完成率”抹掉真实余量

## 3. 跨周机制

> [!tl-pattern] “小交付 → 反馈 → 收束”正在成为稳定节律
> 当任务被写成可在当天验证的交付物，完成率和情绪更稳定；当任务停留在“继续推进项目”，范围会自然膨胀。真正有效的节律不是持续加速，而是让客户反馈改变优先级、让当天复盘改变明天安排。

## 4. 三条证据

> [!tl-evidence] 结论来自哪里
> - ${linkedEvidenceDate(1, periodDates)}：客户原话改变了页面提示优先级。
> - ${linkedEvidenceDate(3, periodDates)}：阻塞项被改写为负责人、检查点与降级方案。
> - ${linkedEvidenceDate(4, periodDates)}：关闭消息后的专注走查发现了更关键的问题。

## 5. 风险边界

> [!tl-caution] 目前仍是强信号，不是普遍结论
> 当前数据能解释个人工作节律，却不能单独证明项目一定按时成功。客户行为指标、缺陷数据和团队依赖状态仍需进入正式项目看板；TideLog 负责的是帮助用户持续做出更好的下一步判断。

## 6. 下月策略

> [!tl-experiment] 只验证一个关键问题
> 上线后的第一个月只跟踪一个核心客户行为指标；同时连续四周验证“上午专注、下午协作”的节律。如果 Insights 没有改变一条下周计划，就不把它视为有效复盘。

## 7. 关联资料

> [!tl-evidence] 可继续追溯
> [[02-Plan/Monthly/${key}|月计划]]　·　[[03-Archive/patterns|模式库]]　·　[[03-Archive/principles|原则库]]`;
}

function profileDocument() {
    return `# 🧭 用户画像

> [!tl-profile] 此刻画像
> 林澈是一位负责跨团队项目的产品经理。她并不缺少责任心或执行力，真正的挑战是：会议、消息和依赖会把注意力切碎，让“很忙”与“关键项目真的前进”难以区分。

## 🧭 Aha Moment

> [!tl-profile] 过去记录里的三个高频主题
> 1. 如何让客户自助中心 Beta 的关键路径持续前进。
> 2. 如何处理跨团队依赖，而不让等待占满注意力。
> 3. 如何在高责任工作中保留可持续的精力节奏。

> [!tl-pattern] 一个反复出现的行为模式
> 上午先完成一个边界清楚的主任务时，全天推进最稳定；若先打开消息处理协作，核心产出往往被推迟到精力下降的下午。

> [!tl-caution] 一个可能的盲点
> 容易把“所有人都有事情在做”理解成“项目正在向目标移动”。忙碌感会掩盖没有负责人、没有检查点的依赖风险。

> [!tl-experiment] 下周一个小实验
> 连续 5 天把消息处理限制在两个固定时段；上午先完成唯一主任务。晚上只记录关键里程碑是否前进，以及这项安排对焦虑的影响。

> [!tl-evidence] 引用证据
> - ${linkedEvidenceDate(3)}：等待接口时，明确负责人和检查点后焦虑下降。
> - ${linkedEvidenceDate(4)}：关闭消息的 90 分钟里发现了更关键的问题。
> - ${linkedEvidenceDate(9)}：周复盘不再依赖翻聊天记录。

## 🌊 长期画像维度

> [!tl-report] 基本信息
> 角色：产品经理 / 跨团队项目负责人。当前阶段：推动客户自助中心 Beta 上线，同时重建可持续的工作节奏。

> [!tl-profile] 情绪特征
> 对完成清晰闭环、拿到明确决策有明显正反馈；跨团队依赖迟迟没有回应时，焦虑最容易上升，并触发频繁检查消息。

> [!tl-pattern] 行动模式
> 擅长把客户原话转成产品判断，也能在信息充分时快速拆解复杂任务。需要避免用即时回复来维持项目掌控感。

> [!tl-report] 思考方式
> 偏系统性，习惯同时考虑客户、业务与研发约束。优势是能看到全局，代价是容易把过多背景都放进同一次沟通。

> [!tl-profile] 价值取向
> 可靠、对用户负责、让团队信息透明、长期可持续，而不是用临时加班掩盖计划问题。

> [!tl-caution] 成长边界
> 学习区是把掌控感从“我随时在线”迁移到“任务、负责人和检查点都清楚”。这会让协作更可靠，也给深度工作留下空间。`;
}

function profileInsightDocument() {
    const currentMetrics = metricsForPeriod(startOfMonth(today), today);
    return `# 🧭 AI 眼中的你 · ${monthKey(today)}

> [!tl-meta] 报告信息
> 依据 ${currentMetrics.loops} 个 Daily 闭环生成　·　更新于 ${formatDate(today)}　·　演示数据

## 1. 核心画像

> [!tl-profile] 你不是执行力不足，而是承担了过多“保持一切不掉线”的隐性责任
> 你能稳定完成高比例任务，也擅长把复杂问题拆开。真正消耗精力的不是工作量本身，而是没有明确负责人和检查点的依赖——它们会让你即使没有在处理，也持续在脑中占用空间。

## 2. 我为什么这样判断

> [!tl-evidence] 三条可以回到原文的证据
> - ${linkedEvidenceDate(3)}：接口等待被改写为负责人、时间点和降级方案后，反复查看消息的冲动下降。
> - ${linkedEvidenceDate(4)}：关闭消息完成主路径走查，发现的问题比零散检查更关键。
> - ${linkedEvidenceDate(9)}：周复盘第一次不靠翻聊天记录，也能还原整周事实。

## 3. 你的稳定优势

> [!tl-pattern] 能把模糊反馈转成团队可执行的判断
> 客户原话、设计假设、技术依赖和业务决策在你的记录里能够被连接起来。你最有价值的产出不是“跟进了很多事情”，而是让团队知道下一步为什么这样做。

## 4. 正在形成的盲点

> [!tl-caution] 在线得更久，并不一定让项目更可控
> 当协作不确定性上升时，你会用更频繁的回复和检查换取安全感。这能暂时降低焦虑，却会挤压真正需要你判断的工作。这个判断有多日证据支持，但仍应结合真实项目结果继续验证。

## 5. 未来 7 天的小实验

> [!tl-experiment] 把掌控感放进系统，而不是放进持续在线
> 每个依赖只保留负责人、下一检查点和降级条件；每天只在午前与下班前处理两次协作消息。晚上记录核心里程碑是否前进，以及当天焦虑评分。

## 6. 更新边界

> [!tl-evidence] 这不是性格定论
> 画像来自当前项目阶段的 ${currentMetrics.loops} 个工作日记录，更接近“此刻有效的工作假设”，而不是永久标签。项目进入稳定运营期后，应重新观察这些模式是否仍然存在。`;
}

function patternsDocument() {
    return `# 🔁 模式库

> [!tl-pattern] 模式的用途
> 这里记录多次复盘后仍然重复出现的现象。模式不是定论，而是下一次行动的观察假设。

## 情绪模式

> [!tl-pattern] 情绪变化
> - 完成一个可见的小闭环或拿到明确决策后，情绪通常会上升。
> - 跨团队依赖没有负责人或检查点时，焦虑感最明显。

## 行为模式

> [!tl-pattern] 行为规律
> - 上午先做主任务时，当天完成度更高。
> - 一打开协作消息就容易连续处理多个小请求，主任务会被推迟到下午。

## 思维模式

> [!tl-pattern] 思考倾向
> - 能同时看到客户、业务和研发约束，但沟通时容易一次补充过多背景。

## 周期性规律

> [!tl-pattern] 周期节律
> - 周初适合锁定关键结果，周中适合集中产出，周末复盘后最容易识别被忙碌掩盖的风险。

## 触发器

> [!tl-caution] 常见触发
> - 零散消息会触发立即回复倾向。
> - 依赖方没有回应时，会触发频繁检查消息和反复预想风险。

## 成功因素

> [!tl-evidence] 有效条件
> - 主任务不超过 3 个，并且每个都能在当天判断是否完成。
> - 依赖项写清负责人、下一检查点和降级条件。
> - 上午保留至少一个不处理消息的连续时段。`;
}

function principlesDocument() {
    return `# 🧩 原则库

> [!tl-experiment] 原则的用途
> 原则要能在下一次做决定时直接使用，而不是停留在漂亮口号。

## 决策类

> [!tl-experiment] 决策原则
> - 如果一项工作不能推动客户主路径、降低上线风险或产生必要决策，就不进入今天前三项。

## 情绪管理类

> [!tl-experiment] 情绪原则
> - 因等待而焦虑时，不反复刷新消息；先写清负责人、检查点和可控的降级动作。

## 效率类

> [!tl-experiment] 效率原则
> - 上午先完成唯一主任务，再处理反馈和消息。
> - 把“继续推进项目”改写成当天可验证的交付物。

## 人际关系类

> [!tl-experiment] 沟通原则
> - 进度同步先写需要对方决定什么，再补最少必要背景。
> - 跟进依赖时讨论事实与时间点，不把压力变成情绪传递。

## 健康类

> [!tl-experiment] 可持续原则
> - 上线前也保留结束工作的时间，不用透支换取表面上的多做一点。

## 通用

> [!tl-experiment] 通用原则
> - 任务、负责人和检查点清楚，比自己随时在线更可靠。
> - 周复盘必须改变一条下周计划，否则只是总结。`;
}

function quickCaptureDocument() {
    return `# 💡 灵感收集

> [!tl-capture] 灵感入口
> 先把零散想法放在这里，之后再推进到日、周或月计划。

- 观察上线后客户在哪一步最容易放弃
- Beta 上线后采访第一位完成自助操作的客户
- 把“负责人 + 检查点 + 降级条件”做成项目模板
- 尝试把周三下午设为无会议时段
- 记录上线后一周最常见的客户搜索词
- 给团队分享一次不靠加班维持项目掌控感的复盘`;
}

function suggestionDocument(scope, target, suggestions, source = 'review') {
    return `---
scope: ${scope}
target: ${target}
updated: ${new Date().toISOString()}
source: ${source}
demo: true
---

# 💡 ${target} ${scope === 'day' ? '日计划建议' : scope === 'week' ? '周计划建议' : '月计划建议'}

> [!tl-experiment] 可执行建议
${suggestions.map((item) => `> - 💡 ${item}`).join('\n')}`;
}

function welcomeDocument(dailyCount) {
    const currentWeekInfo = isoWeekInfo(today);
    return `---
cssclasses:
  - tidelog-demo-home
---

![[99-Assets/tidelog-hero.svg]]

# 从这里开始

> [!tl-quote] 让昨天的笔记，推动明天的行动。
> TideLog 把 Obsidian Daily Notes 连接成 **Plan → Review → Insights → 下一步** 的反馈闭环。

> [!warning] 这是一套演示数据
> Vault 中的人物、计划与复盘均为虚构示例，不包含真实用户隐私、API Key 或真实 License。

> [!tl-profile] 这次体验的主角
> 林澈是一位负责跨团队 Beta 上线的产品经理。她已经用 Obsidian 写了很多会议记录和 Daily Notes，但任务散落、依赖难追、周复盘靠记忆，也很难分辨“每天很忙”与“关键项目真的前进”。

## 先看见完整闭环

| 你要回答的问题 | 打开这里 | 看什么 |
|---|---|---|
| 今天到底要推进什么？ | [[01-Daily/${formatDate(today)}|今天的 Plan]] | 任务、子任务、完成状态 |
| 这周和这个月的方向是什么？ | [[02-Plan/Weekly/${currentWeekInfo.year}-W${pad(currentWeekInfo.week)}|本周计划]] · [[02-Plan/Monthly/${monthKey(today)}|本月计划]] | 日任务如何连接长期目标 |
| 今天发生了什么，明天怎么调？ | [[01-Daily/${formatDate(today)}#复盘|今天的 Review]] | 事实、情绪、模式、明日计划 |
| 多天记录能产生什么？ | [[03-Archive/Insights/${currentWeekInfo.year}-W${currentWeekInfo.week}-周报|本周洞察]] · [[03-Archive/Insights/${monthKey(today)}-月报|本月洞察]] | 证据、模式与小实验 |
| 洞察怎样回到行动？ | [[03-Archive/plan_suggestions/day/${formatDate(today)}|今日计划建议]] | 由复盘生成的下一步 |

## 两条演示路线

> [!tl-plan] 3 分钟快速体验
> 1. 点击左侧 TideLog 波浪图标。
> 2. 在 **Plan** 切换日 / 周 / 月 / 灵感。
> 3. 在 **Review** 点击一个已有闭环的日期。
> 4. 打开 [[03-Archive/Insights/${currentWeekInfo.year}-W${currentWeekInfo.week}-周报|周报]]，看“证据 → 模式 → 下一步”。

> [!tl-review] 8 分钟完整讲解
> 跟随 [[00-产品导览/05-演示讲解脚本]]，从用户痛点讲到数据与隐私边界。

## 这个 Vault 已准备好什么

- **${dailyCount} 篇**连续工作日日记录，覆盖上月与本月。
- 日、周、月计划，以及跨日期灵感收集。
- 当前本周报告、本月报告、AI 画像、模式库、原则库和计划建议。
- TideLog 当前构建已放入 \`.obsidian/plugins/tidelog\`。
- 所有内容都是普通 Markdown，可以直接打开、搜索、链接和迁移。

## 继续了解

- [[00-产品导览/01-为什么是闭环]]
- [[00-产品导览/02-三分钟体验]]
- [[00-产品导览/03-功能地图]]
- [[00-产品导览/04-可靠性、性能与隐私]]
- [[00-产品导览/05-演示讲解脚本]]
- [[00-产品导览/06-演示数据说明]]

> [!tip] 第一次打开
> 若 Obsidian 显示第三方插件安全提示，请确认信任此 Vault。生成脚本会提供 7 天的本地演示 Pro 状态，但不包含真实 License Key；需要现场重新生成 AI 内容时，请使用自己的 API Key。`;
}

const guideDocuments = new Map([
    ['00-产品导览/01-为什么是闭环.md', `# 为什么 TideLog 不是另一款日记插件

很多人已经在 Obsidian 里写 Daily Notes。真正的问题通常不是“没有记录”，而是：

> 昨天写过的计划、卡点和判断，没有在今天需要做决定时回来。

## 记录与反馈系统的差别

| 普通 Daily Notes | TideLog 闭环 |
|---|---|
| 今天写完，文件进入归档 | Review 把事实、情绪和明日调整留在同一条链上 |
| 任务只属于某一天 | 日任务可以看到周目标与月目标 |
| 周报依赖手动回忆 | Insights 在达到闭环数量后读取相关周期记录 |
| 洞察停在总结里 | 计划建议把洞察重新带回日 / 周 / 月计划 |

![[99-Assets/tidelog-loop.svg]]

## 最小闭环

1. **Plan**：早上写 1–3 个真正要推进的任务。
2. **Review**：晚上记录发生了什么，以及明天要怎样调整。
3. **Insights**：积累足够闭环后，从多个日期中寻找重复证据。
4. **下一步**：把报告里的判断转回一个可执行计划。

TideLog 的价值不在于让你多写，而在于让写下来的内容在正确的时间重新出现。

下一步：[[00-产品导览/02-三分钟体验]]`],
    ['00-产品导览/02-三分钟体验.md', `# 三分钟体验

> [!tl-meta] 体验目标
> 跟随产品经理林澈推进一次跨团队 Beta 上线。不配置 AI，不修改设置，先看懂 TideLog 如何把一条记录变成下一步。

## 第 1 分钟：Plan

1. 点击左侧 TideLog 波浪图标。
2. 进入 **Plan**，先看“日”。
3. 点击日期标题，选择一个已有数据的日期。
4. 再切换“周”“月”“灵感”，观察同一件事如何处于不同时间尺度。

建议打开：[[01-Daily/${formatDate(today)}]] 与 [[02-Plan/Weekly/${isoWeekInfo(today).year}-W${pad(isoWeekInfo(today).week)}]]。

## 第 2 分钟：Review

1. 进入 **Review**。
2. 月历里的蓝色半环代表有计划，金色半环代表完成复盘。
3. 点击一个过去日期，查看它的任务、复盘状态和补做入口。
4. 打开原始日记，确认内容仍然是普通 Markdown。

## 第 3 分钟：Insights → 下一步

1. 打开 [[03-Archive/Insights/${isoWeekInfo(currentWeekStart).year}-W${isoWeekInfo(currentWeekStart).week}-周报]]。
2. 只看四块：一句话、事实证据、重复模式、下周实验。
3. 再打开 [[03-Archive/plan_suggestions/day/${formatDate(today)}]]。
4. 对照今天的 Plan：报告并没有结束在总结，而是回到了下一步。

> [!tip] AI 功能
> 演示 Vault 已放好生成后的示例结果。若要现场调用 AI，需要在 Settings → TideLog 中使用自己的 API Key。`],
    ['00-产品导览/03-功能地图.md', `# 功能地图

| 入口 | 用户问题 | 主要能力 | 写入位置 |
|---|---|---|---|
| Plan · 日 | 今天推进什么？ | 任务、子任务、拖拽、勾选、顺延 | \`01-Daily/YYYY-MM-DD.md\` |
| Plan · 周 | 本周什么最重要？ | 周目标、周任务、回顾 | \`02-Plan/Weekly\` |
| Plan · 月 | 这个月向哪里走？ | 月目标、里程碑、成长实验 | \`02-Plan/Monthly\` |
| Plan · 灵感 | 暂时不安排的想法放哪？ | 跨日期 Inbox | \`03-Archive/quick_capture.md\` |
| Review | 今天学到了什么？ | 当日 / 历史日期复盘、问题流 | 对应 Daily Note 的“复盘”段落 |
| Insights · 周 | 这一周有哪些重复证据？ | 3 次闭环后生成 / 更新 | \`03-Archive/Insights\` |
| Insights · 月 | 这个月的主线与跨周模式？ | 8 次闭环后生成 / 更新 | \`03-Archive/Insights\` |
| AI 眼中的你 | 长期记录透露了什么？ | 画像、模式、盲点、小实验 | \`03-Archive/user_profile.md\` |

## 数据如何流动

\`\`\`text
灵感 ──推进──▶ 日 / 周 / 月计划
                   │
                   ▼
              Daily Review
                   │
                   ▼
       周报 / 月报 / 用户画像
                   │
                   ▼
          新的计划建议与行动
\`\`\`

## 免费版和 Pro 的讲解顺序

先让用户跑通免费的 Plan → Review 基础闭环。只有当用户确实需要更完整的问题流、周/月 Insights、画像和报告更新时，再介绍 Pro。不要在第一次讲解里先从价格开始。

继续：[[00-产品导览/04-可靠性、性能与隐私]]`],
    ['00-产品导览/04-可靠性、性能与隐私.md', `# 可靠性、性能与隐私

这部分只描述当前实现能够支持的事实，不给出没有实测依据的速度数字。

## 本地优先

- 日记、计划、报告、画像、模式与原则都是 Vault 内的 Markdown。
- 原生 \`- [ ]\` 任务保持为顶层 Markdown，不被包进不可解析的引用块。
- 用户可以用 Obsidian 自带搜索、链接、Git 或任意同步方案管理这些文件。

## 有范围的读取

| 动作 | 主要读取范围 |
|---|---|
| 周报告 | 目标周的 Daily Notes + 相关周/月计划 + 画像/模式/原则 |
| 月报告 | 目标月的 Daily Notes + 相关月计划与各周计划 |
| 日计划建议 | 最近日记录 + 当前周/月计划 |
| 画像更新 | 最近记录 + 当前画像 |

这意味着 AI 不是在没有提示时扫描整个 Vault。只有用户主动对话、测试连接、生成/更新报告，或完成复盘后刷新建议时才会发起相应调用。

## 长生成的可靠性

- OpenAI 兼容服务会优先尝试 SSE 流式响应。
- 不支持或返回异常时，会退回 Obsidian 的非流式请求路径。
- 长报告在生成过程中可以显示进度，空响应和不完整流有额外保护。

## 性能应该怎样证明

演示时可以展示事实，不建议口头承诺一个脱离设备和 Vault 规模的毫秒数：

1. 在 Plan 中连续切换日 / 周 / 月，观察现有 Markdown 数据是否立即可用。
2. 打开本 Vault 的 ${dailyDates.length} 篇日记录，确认月历、任务数和报告证据能对应。
3. 用自己的真实大 Vault 记录“打开 Plan 到可交互”“切换周期”“生成报告”三项时间。
4. 测试时注明设备、Obsidian 版本、文件数量、AI 服务商和模型。

## 隐私边界

- 演示 Vault 不含 API Key 或真实 License；本地演示 Pro 状态只有 7 天有效期。
- TideLog 不包含客户端遥测、分析 SDK、动态广告或自动更新机制。
- API Key 与 License 在支持 SecretStorage 的 Obsidian 版本中通过 SecretStorage 保存。
- 公开反馈中不要粘贴 Key 或私人笔记原文。

完整产品说明可回到项目根目录的 \`PRIVACY.md\`。`],
    ['00-产品导览/05-演示讲解脚本.md', `# 8 分钟演示讲解脚本

> [!tl-meta] 核心句
> TideLog 不是让你多写一份日记，而是让昨天写下的内容回到今天的行动。

## 0:00–1:00　先讲用户问题

“这是林澈，一位正在推动客户自助中心 Beta 上线的产品经理。她每天在 Obsidian 里记会议、写 Daily Notes，也处理很多待办；但周末复盘时仍要翻聊天记录，而且很难回答：这周真正推动项目的是什么？”

“她的问题不是没有记录，而是记录没有在需要做决定时回来。”

停在 [[00-产品导览/01-为什么是闭环]] 的对比表。

## 1:00–3:00　展示 Plan

打开 TideLog → Plan：

1. 日：展示 1–3 个任务和完成状态。
2. 周：展示日任务如何看到本周主线。
3. 月：展示里程碑如何提供更长尺度。
4. 灵感：展示暂时不承诺日期的 Inbox。

讲解句：“同一件事可以从灵感进入计划，但不会因为被记录就自动变成承诺。”

## 3:00–4:30　展示 Review

进入 Review，点击已有闭环的历史日期。

讲解句：“蓝色代表那天有计划，金色代表它完成了有效复盘。漏掉一天也可以补做，所以闭环不是打卡惩罚。”

打开 [[01-Daily/${formatDate(today)}#复盘]]，快速扫过目标对标、成功日记、情绪、焦虑觉察和明日计划。

## 4:30–6:15　展示 Insights

打开 [[03-Archive/Insights/${isoWeekInfo(currentWeekStart).year}-W${isoWeekInfo(currentWeekStart).week}-周报]]。

只讲四件事：

1. 一句话判断。
2. 它引用了哪些事实。
3. 什么模式重复出现。
4. 下周只做哪个小实验。

随后打开 [[03-Archive/plan_suggestions/day/${formatDate(today)}]]。

讲解句：“一篇报告如果没有改变下一步，它仍然只是归档。TideLog 的最后一步是把洞察重新带回计划。”

## 6:15–7:15　展示数据所有权

直接在文件树打开 \`01-Daily\`、\`02-Plan\`、\`03-Archive\`。

讲解句：“这些不是锁在 TideLog 数据库里的对象。任务仍是原生 Markdown checkbox，日记和报告仍在你的 Vault。”

## 7:15–8:00　收束与下一步

“先免费跑通一次 Plan → Review。如果你发现自己真的需要跨周、跨月模式，再考虑完整 Insights 和画像。第一步不是配置所有参数，而是写下今天最重要的 1–3 件事。”

最后停回 [[00-从这里开始]]。`],
    ['00-产品导览/06-演示数据说明.md', `# 演示数据说明

## 数据身份

本 Vault 描述的是虚构用户“林澈”：一位负责跨团队项目的产品经理，正在推动客户自助中心 Beta 上线。她已经用 Obsidian 记录会议与 Daily Notes，但任务散落在消息和笔记里，周复盘仍然依赖记忆，也很难分辨“很忙”与“关键项目真的前进”。

## 为什么使用连续数据

Insights 的价值只有在多个 Plan / Review 闭环之间才能看见。演示库因此覆盖：

- 上一个完整月份的工作日闭环。
- 本月截至今天的工作日闭环。
- 当前周与上一个完整周的周报。
- 当前月与上一个完整月的月报。
- 当前画像、模式库、原则库与三种周期的计划建议。

## 日期如何保持新鲜

在项目根目录运行：

\`\`\`bash
npm run demo:vault
\`\`\`

脚本会以执行当天为基准重新生成示例日期，并同步当前插件构建。它只更新自己管理的文件，不会删除你另外添加的演示笔记。

## 使用限制

- 示例报告是预先编写的展示内容，不代表某个模型的实时输出。
- 性能页不提供未经同一环境实测的耗时数字。
- 演示库不包含 API Key、真实 License 或真实用户记录。
- 本地演示 Pro 状态只用于产品截图，并会在 7 天后失效。`],
]);

function writeVault() {
    ensureDir('');

    copyIntoVault('main.js', '.obsidian/plugins/tidelog/main.js');
    copyIntoVault('manifest.json', '.obsidian/plugins/tidelog/manifest.json');
    copyIntoVault('styles.css', '.obsidian/plugins/tidelog/styles.css');
    for (const asset of ['tidelog-logo.svg', 'tidelog-hero.svg', 'tidelog-loop.svg', 'tidelog-preview.svg']) {
        copyIntoVault(`assets/${asset}`, `99-Assets/${asset}`);
    }

    writeJson('.obsidian/app.json', {
        alwaysUpdateLinks: true,
        attachmentFolderPath: '99-Assets',
        newFileLocation: 'folder',
        newFileFolderPath: '01-Daily',
        readableLineLength: false,
        showLineNumber: true,
        strictLineBreaks: false,
    });
    writeJson('.obsidian/appearance.json', {
        accentColor: '#2f78c4',
        baseFontSize: 16,
        enabledCssSnippets: ['tidelog-demo'],
        interfaceFontFamily: '',
        textFontFamily: '',
        monospaceFontFamily: '',
    });
    writeJson('.obsidian/community-plugins.json', ['tidelog']);
    writeJson('.obsidian/core-plugins.json', [
        'file-explorer',
        'global-search',
        'switcher',
        'graph',
        'backlink',
        'outgoing-link',
        'tag-pane',
        'page-preview',
        'daily-notes',
        'templates',
        'note-composer',
        'command-palette',
        'editor-status',
        'bookmarks',
        'outline',
        'word-count',
        'file-recovery',
    ]);
    writeJson('.obsidian/hotkeys.json', {
        'tidelog:open-chat': [{ modifiers: ['Mod', 'Shift'], key: 'L' }],
    });
    writeJson('.obsidian/plugins/tidelog/data.json', {
        proLicense: {
            key: '',
            activated: true,
            activatedAt: demoProActivatedAt,
            deviceId: 'tidelog-demo-vault-local-only',
            lastVerified: demoProActivatedAt,
            licenseType: 'annual',
            expiresAt: demoProExpiresAt,
        },
        language: 'zh',
        onboardingCompleted: true,
        firstInsightCompleted: true,
        dayBoundaryHour: 2,
        dailyFolder: '01-Daily',
        planFolder: '02-Plan',
        archiveFolder: '03-Archive',
        enableMorningSOP: true,
        enableEveningSOP: true,
        includeOptionalQuestions: true,
    });
    writeText('.obsidian/snippets/tidelog-demo.css', `
.tidelog-demo-home .inline-title {
  display: none;
}

.tidelog-demo-home img {
  border-radius: 18px;
}

.tidelog-demo-home table {
  width: 100%;
}

.tidelog-demo-home .callout[data-callout="warning"] {
  --callout-color: 210, 145, 55;
}

body {
  --h1-color: var(--text-accent);
  --link-color: #2f78c4;
  --link-color-hover: #225c97;
}`);

    dailyDates.forEach((date, index) => writeText(`01-Daily/${formatDate(date)}.md`, dailyNote(date, index)));

    const weekStarts = new Map();
    for (const date of dailyDates) {
        const start = startOfIsoWeek(date);
        weekStarts.set(formatDate(start), start);
    }
    [...weekStarts.values()].sort((a, b) => a - b).forEach((weekStart, index) => {
        const info = isoWeekInfo(weekStart);
        writeText(
            `02-Plan/Weekly/${info.year}-W${pad(info.week)}.md`,
            weeklyPlan(weekStart, index, formatDate(weekStart) === formatDate(currentWeekStart)),
        );
    });

    writeText(`02-Plan/Monthly/${monthKey(previousMonth)}.md`, monthlyPlan(previousMonth, false));
    writeText(`02-Plan/Monthly/${monthKey(today)}.md`, monthlyPlan(today, true));

    const previousWeekInfo = isoWeekInfo(previousWeekStart);
    const currentWeekInfo = isoWeekInfo(currentWeekStart);
    writeText(
        `03-Archive/Insights/${previousWeekInfo.year}-W${previousWeekInfo.week}-周报.md`,
        weeklyInsight(previousWeekStart),
    );
    writeText(
        `03-Archive/Insights/${currentWeekInfo.year}-W${currentWeekInfo.week}-周报.md`,
        weeklyInsight(currentWeekStart, true),
    );
    writeText(`03-Archive/Insights/${monthKey(previousMonth)}-月报.md`, monthlyInsight(previousMonth));
    writeText(`03-Archive/Insights/${monthKey(today)}-月报.md`, monthlyInsight(today, true));
    writeText(`03-Archive/Insights/${formatDate(today)}-画像更新.md`, profileInsightDocument());
    writeText('03-Archive/user_profile.md', profileDocument());
    writeText('03-Archive/patterns.md', patternsDocument());
    writeText('03-Archive/principles.md', principlesDocument());
    writeText('03-Archive/quick_capture.md', quickCaptureDocument());

    writeText(
        `03-Archive/plan_suggestions/day/${formatDate(today)}.md`,
        suggestionDocument('day', formatDate(today), [
            '把设计评审留下的 3 个假设写进验证清单，不继续扩展方案。',
            '为每个假设补齐负责人、所需证据和最晚检查点。',
            '本周无法验证的内容明确移到下一版本，避免 Beta 范围回弹。',
        ]),
    );
    writeText(
        `03-Archive/plan_suggestions/week/${currentWeekInfo.year}-W${pad(currentWeekInfo.week)}.md`,
        suggestionDocument('week', `${currentWeekInfo.year}-W${pad(currentWeekInfo.week)}`, [
            '把 3 个待验证假设转成负责人、证据和检查点。',
            '周四确认接口依赖与降级条件，避免方案一致但无法交付。',
            '周五只复盘 Beta 两条主路径，不把下一版本需求混进本周结论。',
        ], 'insight'),
    );
    writeText(
        `03-Archive/plan_suggestions/month/${monthKey(today)}.md`,
        suggestionDocument('month', monthKey(today), [
            '本月只守住 Beta 主路径、上线监控和回滚准备。',
            '用客户行为与访谈证据决定优先级，不被单条反馈带走。',
            '让月度洞察至少改变一项下月节奏或项目安排。',
        ], 'insight'),
    );

    writeText('00-从这里开始.md', welcomeDocument(dailyDates.length));
    for (const [relativePath, content] of guideDocuments) writeText(relativePath, content);
    writeText('README.md', `# TideLog Demo Vault

请在 Obsidian 中打开此文件夹，然后从 [[00-从这里开始]] 开始。

这是一套虚构演示数据，不包含真实用户隐私、API Key 或真实 License。`);
}

function collectFiles(root) {
    const files = [];
    if (!fs.existsSync(root)) return files;
    for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
        const absolutePath = path.join(root, entry.name);
        if (entry.isDirectory()) files.push(...collectFiles(absolutePath));
        else files.push(absolutePath);
    }
    return files;
}

function validateVault() {
    const errors = [];
    const allFiles = collectFiles(vaultRoot);
    const markdownFiles = allFiles.filter((file) => file.endsWith('.md') && !file.includes(`${path.sep}.obsidian${path.sep}`));
    const relativeFiles = new Set(allFiles.map((file) => path.relative(vaultRoot, file).split(path.sep).join('/')));
    const markdownTargets = new Set(markdownFiles.map((file) => path.relative(vaultRoot, file).split(path.sep).join('/').replace(/\.md$/, '')));
    const markdownBasenames = new Set(markdownFiles.map((file) => path.basename(file, '.md')));

    const requiredFiles = [
        '00-从这里开始.md',
        `01-Daily/${formatDate(today)}.md`,
        `02-Plan/Weekly/${isoWeekInfo(today).year}-W${pad(isoWeekInfo(today).week)}.md`,
        `02-Plan/Monthly/${monthKey(today)}.md`,
        `03-Archive/Insights/${isoWeekInfo(currentWeekStart).year}-W${isoWeekInfo(currentWeekStart).week}-周报.md`,
        `03-Archive/Insights/${monthKey(today)}-月报.md`,
        `03-Archive/Insights/${formatDate(today)}-画像更新.md`,
        `03-Archive/Insights/${isoWeekInfo(previousWeekStart).year}-W${isoWeekInfo(previousWeekStart).week}-周报.md`,
        `03-Archive/Insights/${monthKey(previousMonth)}-月报.md`,
        '03-Archive/user_profile.md',
        '03-Archive/patterns.md',
        '03-Archive/principles.md',
        '03-Archive/quick_capture.md',
        '.obsidian/plugins/tidelog/main.js',
        '.obsidian/plugins/tidelog/manifest.json',
        '.obsidian/plugins/tidelog/styles.css',
    ];
    for (const requiredFile of requiredFiles) {
        if (!relativeFiles.has(requiredFile)) errors.push(`Missing required file: ${requiredFile}`);
    }

    const dailyFiles = markdownFiles.filter((file) => (
        file.includes(`${path.sep}01-Daily${path.sep}`)
        && fs.readFileSync(file, 'utf8').includes('demo: true')
    ));
    if (dailyFiles.length < 16) errors.push(`Expected at least 16 daily notes, found ${dailyFiles.length}`);
    for (const file of dailyFiles) {
        const content = fs.readFileSync(file, 'utf8');
        if (!content.includes('## 计划') || !content.includes('## 复盘')) {
            errors.push(`Daily note cannot form a TideLog loop: ${path.relative(vaultRoot, file)}`);
        }
        if (!/^- \[[ x]\] /m.test(content)) errors.push(`Daily note has no native task: ${path.relative(vaultRoot, file)}`);
        const reviewCallouts = content.match(/^> \[!tl-review\] (目标对标|成功日记|开心事与情绪|焦虑觉察|明日计划)$/gm) ?? [];
        if (reviewCallouts.length !== 5) {
            errors.push(`Daily review is missing the five core reflections: ${path.relative(vaultRoot, file)}`);
        }
        const firstPersonSignals = content.match(/我|自己/g) ?? [];
        if (firstPersonSignals.length < 4) {
            errors.push(`Daily review does not read like a first-person journal: ${path.relative(vaultRoot, file)}`);
        }
        if (/完成清晰的小闭环时很有掌控感|最关键的推进是：/.test(content)) {
            errors.push(`Daily review still contains generic demo phrasing: ${path.relative(vaultRoot, file)}`);
        }
    }

    for (const file of markdownFiles) {
        const content = fs.readFileSync(file, 'utf8');
        const wikiLinks = content.matchAll(/!?\[\[([^\]|#]+)(?:#[^\]|]+)?(?:\|[^\]]+)?\]\]/g);
        for (const match of wikiLinks) {
            const target = match[1].trim();
            if (!target) continue;
            const extension = path.extname(target);
            if (extension) {
                if (!relativeFiles.has(target)) {
                    errors.push(`Broken attachment/file link in ${path.relative(vaultRoot, file)}: ${target}`);
                }
            } else if (!markdownTargets.has(target) && !markdownBasenames.has(target)) {
                errors.push(`Broken wiki link in ${path.relative(vaultRoot, file)}: ${target}`);
            }
        }
        if (/sk-[A-Za-z0-9_-]{12,}/.test(content)) {
            errors.push(`Possible API key in ${path.relative(vaultRoot, file)}`);
        }
        if (/林舟|正在推广 TideLog|独立开发者.*TideLog/.test(content)) {
            errors.push(`Old developer-centered demo persona remains in ${path.relative(vaultRoot, file)}`);
        }
    }

    const screenshotReports = [
        `03-Archive/Insights/${isoWeekInfo(currentWeekStart).year}-W${isoWeekInfo(currentWeekStart).week}-周报.md`,
        `03-Archive/Insights/${monthKey(today)}-月报.md`,
        `03-Archive/Insights/${formatDate(today)}-画像更新.md`,
    ];
    for (const reportPath of screenshotReports) {
        const absolutePath = path.join(vaultRoot, reportPath);
        if (!fs.existsSync(absolutePath)) continue;
        const content = fs.readFileSync(absolutePath, 'utf8');
        const sectionCount = content.split('\n').filter((line) => /^## \d+\./.test(line)).length;
        if (sectionCount < 5) {
            errors.push(`Screenshot report needs at least 5 evidence-led sections: ${reportPath}`);
        }
    }

    const dataPath = path.join(vaultRoot, '.obsidian/plugins/tidelog/data.json');
    if (fs.existsSync(dataPath)) {
        const data = JSON.parse(fs.readFileSync(dataPath, 'utf8'));
        const providers = Object.values(data.providers ?? {});
        if (providers.some((provider) => typeof provider?.apiKey === 'string' && provider.apiKey.trim())) {
            errors.push('Demo plugin data should not contain an API key');
        }
        const license = data.proLicense ?? {};
        if (typeof license.key === 'string' && license.key.trim()) {
            errors.push('Demo plugin data should not contain a real License Key');
        }
        if (
            !license.activated
            || license.deviceId !== 'tidelog-demo-vault-local-only'
            || license.licenseType !== 'annual'
            || Number(license.expiresAt) <= Date.now()
        ) {
            errors.push('Demo Pro state is missing, expired, or not scoped to the demo vault');
        }
    }

    if (errors.length > 0) {
        console.error('\nTideLog demo vault validation failed:\n');
        for (const error of errors) console.error(`- ${error}`);
        process.exitCode = 1;
        return;
    }

    console.log(`TideLog demo vault is valid: ${markdownFiles.length} Markdown files, ${dailyFiles.length} daily loops.`);
    console.log(`Vault: ${vaultRoot}`);
}

if (!checkOnly) {
    writeVault();
}
validateVault();
