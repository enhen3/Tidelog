export type InsightFileLanguage = 'zh' | 'en';

interface InsightDateLike {
    isoWeek(): number;
    isoWeekYear(): number;
    format(pattern: string): string;
}

/**
 * Return every weekly report filename TideLog has used, with the current
 * language first. ISO week-year is mandatory: calendar year is wrong for the
 * week that crosses New Year's Day.
 */
export function weeklyInsightFileNames(
    date: InsightDateLike,
    preferredLanguage: InsightFileLanguage,
): string[] {
    const year = String(date.isoWeekYear());
    const week = String(date.isoWeek());
    const weekVariants = [...new Set([week, week.padStart(2, '0')])];
    const suffixes = preferredLanguage === 'en'
        ? ['weekly.md', 'weekly-report.md', '周报.md']
        : ['周报.md', 'weekly.md', 'weekly-report.md'];

    return suffixes.flatMap(suffix => weekVariants.map(value => `${year}-W${value}-${suffix}`));
}

/** Return localized and legacy monthly filenames so language changes do not hide reports. */
export function monthlyInsightFileNames(
    date: InsightDateLike,
    preferredLanguage: InsightFileLanguage,
): string[] {
    const month = date.format('YYYY-MM');
    const suffixes = preferredLanguage === 'en'
        ? ['monthly.md', 'monthly-report.md', '月报.md']
        : ['月报.md', 'monthly.md', 'monthly-report.md'];
    return suffixes.map(suffix => `${month}-${suffix}`);
}
