import { App, TFile } from 'obsidian';

export async function replaceFile(app: App, file: TFile, content: string): Promise<void> {
    await app.vault.process(file, () => content);
}

export async function updateFile(
    app: App,
    file: TFile,
    updater: (content: string) => string,
): Promise<void> {
    await app.vault.process(file, updater);
}
