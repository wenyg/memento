/**
 * Memento 项目类型定义
 */

export interface MdFileInfo {
    path: string;
    birthtime: Date;
    relativePath: string;
    displayTitle: string;
    tags?: string[];
}

export interface FrontMatter {
    title?: string;
    date?: string;
    tags?: string[];
    [key: string]: any;
}

export interface MementoConfig {
    excludeFolders: string[];
    dailyNotesPath: string;
    dailyNoteFileNameFormat: string;
    dailyNoteTemplatePath: string;
    weeklyNotesPath: string;
    weeklyNoteFileNameFormat: string;
    weeklyNoteTemplatePath: string;
    defaultNotePath: string;
}

export interface TagInfo {
    tag: string;
    files: MdFileInfo[];
    children?: TagInfo[];
}

export enum ViewMode {
    FILES = 'files',
    TAGS = 'tags',
    CALENDAR = 'calendar',
    SETTINGS = 'settings'
}

export type CalendarItemType = 'daily' | 'weekly' | 'action' | 'command' | 'file' | 'category' | 'week-item' | 'daily-group';
export type PeriodicNoteType = 'daily' | 'weekly';
