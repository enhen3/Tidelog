/**
 * 猜测用户存放旧日记的文件夹。
 *
 * 这段逻辑原本藏在 `first-insight-modal.ts` 里。抽出来的直接原因是：
 * 它有一个 `folderOptions[0]` 兜底——没有任何语义线索时会选字典序第一个目录，
 * **猜错是常态，不是意外**。引导弹窗现在也要展示这个猜测值，两处必须给出同一个答案，
 * 而且都必须在界面上说明「这是猜测」。
 */

export interface JournalFolderGuessContext {
    /** TideLog 归档区。它是产物目录，永远不该被当成用户的旧日记来源。 */
    archiveFolder: string;
    /** 用户在设置里指定的日记目录。有它就优先，比任何猜测都可靠。 */
    dailyFolder: string;
}

/** 过滤掉归档区，并按字典序排序。全被过滤光时退回原列表，避免选择器空掉。 */
export function importableFolderOptions(
    folderOptions: string[],
    context: JournalFolderGuessContext,
): string[] {
    const { archiveFolder } = context;
    const filtered = folderOptions.filter((folderPath) => {
        return folderPath !== archiveFolder
            && !folderPath.startsWith(`${archiveFolder}/`);
    });
    return (filtered.length > 0 ? filtered : folderOptions).sort((a, b) => a.localeCompare(b));
}

/**
 * 猜一个默认目录。
 *
 * 顺序：名字像日记的 → 名字像 daily 的 → 用户设置里的 dailyFolder → 字典序第一个。
 * 最后那一档是纯兜底，调用方**必须**把结果标注为猜测，不能当成事实展示。
 */
export function guessJournalFolder(
    folderOptions: string[],
    context: JournalFolderGuessContext,
): string {
    const { archiveFolder, dailyFolder } = context;
    const isImportableFolder = (folderPath: string) => {
        return !folderPath.startsWith(`${archiveFolder}/`)
            && folderPath !== archiveFolder;
    };

    const legacyLike = folderOptions.find((folderPath) => {
        return isImportableFolder(folderPath)
            && /(legacy|journal|diary|日记)/i.test(folderPath.toLowerCase());
    });
    if (legacyLike) return legacyLike;

    const dailyLike = folderOptions.find((folderPath) => {
        return isImportableFolder(folderPath)
            && /daily/i.test(folderPath.toLowerCase());
    });
    if (dailyLike) return dailyLike;

    if (folderOptions.includes(dailyFolder)) return dailyFolder;

    return folderOptions[0] ?? '';
}

/**
 * 这次给出的是有语义依据的匹配，还是字典序兜底？
 *
 * 用来决定提示语的强弱：兜底时必须更明确地让用户确认。
 */
export function isFolderGuessFallback(
    guess: string,
    _folderOptions: string[],
    context: JournalFolderGuessContext,
): boolean {
    if (!guess) return false;
    if (guess === context.dailyFolder) return false;
    return !/(legacy|journal|diary|日记|daily)/i.test(guess.toLowerCase());
}
