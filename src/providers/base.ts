/**
 * 基础 TreeItem 类
 */

import * as vscode from 'vscode';
import { MdFileInfo, TagInfo, CalendarItemType } from '../types';

export class MdFileItem extends vscode.TreeItem {
    public readonly fileInfo: MdFileInfo | null;
    public readonly isCreateAction: boolean;

    constructor(
        fileInfo: MdFileInfo | null,
        collapsibleState: vscode.TreeItemCollapsibleState,
        isCreateAction: boolean = false
    ) {
        // 如果是"新建笔记"操作
        if (isCreateAction) {
            super('新建笔记', collapsibleState);
        } else if (fileInfo) {
            super(fileInfo.displayTitle, collapsibleState);
        } else {
            super('', collapsibleState);
        }

        // 在 super() 之后赋值属性
        this.fileInfo = fileInfo;
        this.isCreateAction = isCreateAction;

        // 设置其他属性
        if (isCreateAction) {
            this.tooltip = '点击创建新笔记';
            this.command = {
                command: 'memento.createNote',
                title: 'Create Note'
            };
            this.contextValue = 'createNoteAction';
            this.iconPath = new vscode.ThemeIcon('new-file', new vscode.ThemeColor('charts.green'));
        } else if (fileInfo) {
            this.tooltip = `${fileInfo.relativePath}\nCreated: ${fileInfo.birthtime.toLocaleString()}`;
            this.description = fileInfo.birthtime.toLocaleDateString();
            this.resourceUri = vscode.Uri.file(fileInfo.path);
            this.command = {
                command: 'markdown.showPreview',
                title: 'Open Preview',
                arguments: [this.resourceUri]
            };
            this.contextValue = 'mdFile';
            this.iconPath = new vscode.ThemeIcon('markdown');
        }
    }
}

export class TagItem extends vscode.TreeItem {
    constructor(
        public readonly tagInfo: TagInfo,
        public readonly collapsibleState: vscode.TreeItemCollapsibleState,
        public readonly isFile: boolean = false,
        public readonly fileInfo?: MdFileInfo
    ) {
        // 调用父类构造函数
        super(
            isFile && fileInfo ? fileInfo.displayTitle : tagInfo.tag,
            collapsibleState
        );

        if (isFile && fileInfo) {
            this.tooltip = `${fileInfo.relativePath}\nCreated: ${fileInfo.birthtime.toLocaleString()}`;
            this.description = fileInfo.birthtime.toLocaleDateString();
            this.resourceUri = vscode.Uri.file(fileInfo.path);
            this.command = {
                command: 'markdown.showPreview',
                title: 'Open Preview',
                arguments: [this.resourceUri]
            };
            this.contextValue = 'mdFile';
            this.iconPath = new vscode.ThemeIcon('markdown');
        } else {
            this.tooltip = `Tag: ${tagInfo.tag} (${tagInfo.files.length} files)`;
            this.description = `${tagInfo.files.length} files`;
            this.contextValue = 'tag';
            this.iconPath = new vscode.ThemeIcon('tag');
        }
    }
}

export class CalendarItem extends vscode.TreeItem {
    constructor(
        public readonly label: string,
        public readonly collapsibleState: vscode.TreeItemCollapsibleState,
        public readonly itemType: CalendarItemType,
        public readonly action?: () => void,
        public readonly filePath?: string
    ) {
        super(label, collapsibleState);

        if (itemType === 'action') {
            this.contextValue = 'calendarAction';
            this.iconPath = new vscode.ThemeIcon('edit');
            this.command = {
                command: 'memento.executeSettingAction',
                title: 'Edit',
                arguments: [this]
            };
        } else if (itemType === 'command') {
            this.contextValue = 'calendarCommand';
            this.iconPath = new vscode.ThemeIcon('play');
            this.command = {
                command: 'memento.executeSettingCommand',
                title: 'Run',
                arguments: [this]
            };
        } else if (itemType === 'file') {
            this.contextValue = 'calendarFile';
            this.iconPath = new vscode.ThemeIcon('markdown');
            if (filePath) {
                this.resourceUri = vscode.Uri.file(filePath);
                this.command = {
                    command: 'vscode.open',
                    title: 'Open',
                    arguments: [this.resourceUri]
                };
            }
        } else if (itemType === 'week-item') {
            this.contextValue = 'calendarWeekItem';
            this.iconPath = new vscode.ThemeIcon('notebook');
            // 周报项目可以点击打开
            if (filePath) {
                this.resourceUri = vscode.Uri.file(filePath);
                this.command = {
                    command: 'vscode.open',
                    title: 'Open',
                    arguments: [this.resourceUri]
                };
            }
        } else if (itemType === 'daily-group') {
            this.contextValue = 'calendarDailyGroup';
            this.iconPath = new vscode.ThemeIcon('calendar');
        } else {
            this.contextValue = 'calendarCategory';
            this.iconPath = new vscode.ThemeIcon(itemType === 'daily' ? 'calendar' : 'notebook');
        }
    }
}
