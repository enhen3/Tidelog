/**
 * File Linker Service - Bidirectional sync between daily notes and kanban boards
 */

import { App, TFile, EventRef } from 'obsidian';
import { AIFlowSettings } from '../types';
import { KanbanService } from './kanban-service';

export class FileLinkService {
    private app: App;
    private settings: AIFlowSettings;
    private kanbanService: KanbanService;
    private syncing = false;
    private debounceTimer: ReturnType<typeof setTimeout> | null = null;
    private eventRef: EventRef | null = null;

    constructor(app: App, settings: AIFlowSettings, kanbanService: KanbanService) {
        this.app = app;
        this.settings = settings;
        this.kanbanService = kanbanService;
    }

    /**
     * Start listening for file modifications
     */
    startListening(): void {
        this.eventRef = this.app.vault.on('modify', (file) => {
            if (this.syncing) return;
            if (!(file instanceof TFile)) return;

            // Only react to daily notes
            if (file.path.startsWith(this.settings.dailyFolder + '/')) {
                this.debouncedSync(file);
            }
        });
    }

    /**
     * Stop listening for file modifications
     */
    stopListening(): void {
        if (this.eventRef) {
            this.app.vault.offref(this.eventRef);
            this.eventRef = null;
        }
        if (this.debounceTimer) {
            clearTimeout(this.debounceTimer);
            this.debounceTimer = null;
        }
    }

    /**
     * Debounced sync to avoid rapid updates
     */
    private debouncedSync(file: TFile): void {
        if (this.debounceTimer) {
            clearTimeout(this.debounceTimer);
        }

        this.debounceTimer = setTimeout(async () => {
            await this.syncDailyNoteToKanban(file);
        }, 800);
    }

    /**
     * Sync a daily note's tasks to the kanban board
     */
    private async syncDailyNoteToKanban(file: TFile): Promise<void> {
        this.syncing = true;

        try {
            // Extract date from filename (YYYY-MM-DD.md)
            const dateMatch = file.basename.match(/^(\d{4}-\d{2}-\d{2})$/);
            if (!dateMatch) return;

            const date = new Date(dateMatch[1]);
            await this.kanbanService.syncFromDailyNote(date);
        } catch (error) {
            console.error('[FileLinkService] Sync error:', error);
        } finally {
            this.syncing = false;
        }
    }
}
