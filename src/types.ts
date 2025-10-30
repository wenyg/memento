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
    TODO = 'todo',
    SETTINGS = 'settings'
}

export type CalendarItemType = 'daily' | 'weekly' | 'action' | 'command' | 'file' | 'category' | 'week-item' | 'daily-group';
export type PeriodicNoteType = 'daily' | 'weekly';

/**
 * TODO 项信息
 */
export interface TodoItem {
    filePath: string;
    fileName: string;
    lineNumber: number;
    content: string;
    completed: boolean;
    level: number;
    tags: string[];
    due?: string;
    endTime?: string;  // 完成时间 YYYY-MM-DD
}

/**
 * TODO 组信息（按文件、项目、标签等分组）
 */
export interface TodoGroup {
    label: string;
    todos: TodoItem[];
    children?: TodoGroup[];
}
