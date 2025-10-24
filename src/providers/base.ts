/**
 * 基础 TreeItem 类
 */

import * as vscode from 'vscode';
import { MdFileInfo, TagInfo, CalendarItemType } from '../types';

export class MdFileItem extends vscode.TreeItem {
    constructor(
        public readonly fileInfo: MdFileInfo,
        public readonly collapsibleState: vscode.TreeItemCollapsibleState
    ) {
        super(fileInfo.displayTitle, collapsibleState);
        this.tooltip = `${this.fileInfo.relativePath}\nCreated: ${this.fileInfo.birthtime.toLocaleString()}`;
        this.description = this.fileInfo.birthtime.toLocaleDateString();
        this.resourceUri = vscode.Uri.file(this.fileInfo.path);
        this.command = {
            command: 'markdown.showPreview',
            title: 'Open Preview',
            arguments: [this.resourceUri]
        };
        this.contextValue = 'mdFile';
        this.iconPath = new vscode.ThemeIcon('markdown');
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
        } else {
            this.contextValue = 'calendarCategory';
            this.iconPath = new vscode.ThemeIcon(itemType === 'daily' ? 'calendar' : 'notebook');
        }
    }
}
