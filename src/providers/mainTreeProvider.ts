/**
 * 主树提供者 - 管理不同视图模式
 */

import * as vscode from 'vscode';
import { ViewMode } from '../types';
import { getNotesRootPath, loadMementoConfig } from '../config';
import { MdFileItem, TagItem, CalendarItem } from './base';
import { MdFilesProvider } from './mdFilesProvider';
import { TagTreeProvider } from './tagTreeProvider';
import { CalendarProvider } from './calendarProvider';
import { TodoTreeProvider, TodoTreeItem } from './todoTreeProvider';

export class MainTreeProvider implements vscode.TreeDataProvider<MdFileItem | TagItem | CalendarItem | TodoTreeItem> {
    private _onDidChangeTreeData: vscode.EventEmitter<MdFileItem | TagItem | CalendarItem | TodoTreeItem | undefined | null | void> = new vscode.EventEmitter<MdFileItem | TagItem | CalendarItem | TodoTreeItem | undefined | null | void>();
    readonly onDidChangeTreeData: vscode.Event<MdFileItem | TagItem | CalendarItem | TodoTreeItem | undefined | null | void> = this._onDidChangeTreeData.event;

    private currentMode: ViewMode = ViewMode.FILES;
    private fileProvider: MdFilesProvider;
    private tagProvider: TagTreeProvider;
    private calendarProvider: CalendarProvider;
    private todoProvider: TodoTreeProvider;

    constructor() {
        this.fileProvider = new MdFilesProvider();
        this.tagProvider = new TagTreeProvider();
        this.calendarProvider = new CalendarProvider();
        this.todoProvider = new TodoTreeProvider();

        // 监听所有提供者的变化
        this.fileProvider.onDidChangeTreeData(() => {
            if (this.currentMode === ViewMode.FILES) {
                this._onDidChangeTreeData.fire();
            }
        });

        this.tagProvider.onDidChangeTreeData(() => {
            if (this.currentMode === ViewMode.TAGS) {
                this._onDidChangeTreeData.fire();
            }
        });

        this.calendarProvider.onDidChangeTreeData(() => {
            if (this.currentMode === ViewMode.CALENDAR) {
                this._onDidChangeTreeData.fire();
            }
        });

        this.todoProvider.onDidChangeTreeData(() => {
            if (this.currentMode === ViewMode.TODO) {
                this._onDidChangeTreeData.fire();
            }
        });
    }

    switchToFileView(): void {
        this.currentMode = ViewMode.FILES;
        this._onDidChangeTreeData.fire();
    }

    switchToTagView(): void {
        this.currentMode = ViewMode.TAGS;
        this._onDidChangeTreeData.fire();
    }

    switchToCalendarView(): void {
        this.currentMode = ViewMode.CALENDAR;
        this._onDidChangeTreeData.fire();
    }

    switchToSettingsView(): void {
        this.currentMode = ViewMode.SETTINGS;
        this._onDidChangeTreeData.fire();
    }

    switchToTodoView(): void {
        this.currentMode = ViewMode.TODO;
        this._onDidChangeTreeData.fire();
    }

    refresh(): void {
        if (this.currentMode === ViewMode.FILES) {
            this.fileProvider.refresh();
        } else if (this.currentMode === ViewMode.TAGS) {
            this.tagProvider.refresh();
        } else if (this.currentMode === ViewMode.CALENDAR) {
            this.calendarProvider.refresh();
        } else if (this.currentMode === ViewMode.TODO) {
            this.todoProvider.refresh();
        }
    }

    getTodoProvider(): TodoTreeProvider {
        return this.todoProvider;
    }

    getTreeItem(element: MdFileItem | TagItem | CalendarItem | TodoTreeItem): vscode.TreeItem {
        return element;
    }

    getChildren(element?: MdFileItem | TagItem | CalendarItem | TodoTreeItem): Thenable<(MdFileItem | TagItem | CalendarItem | TodoTreeItem)[]> {
        if (this.currentMode === ViewMode.FILES) {
            return this.fileProvider.getChildren(element as MdFileItem);
        } else if (this.currentMode === ViewMode.TAGS) {
            return this.tagProvider.getChildren(element as TagItem);
        } else if (this.currentMode === ViewMode.CALENDAR) {
            return this.calendarProvider.getChildren(element as CalendarItem);
        } else if (this.currentMode === ViewMode.TODO) {
            return this.todoProvider.getChildren(element as TodoTreeItem);
        } else {
            // SETTINGS 模式
            return this.getSettingsItems(element as CalendarItem);
        }
    }

    private async getSettingsItems(element?: CalendarItem): Promise<CalendarItem[]> {
        const notesPath = await getNotesRootPath();
        if (!notesPath) {
            return [];
        }

        const config = await loadMementoConfig(notesPath);

        // 根级别 - 显示分类
        if (!element) {
            return [
                new CalendarItem('📂 笔记根目录', vscode.TreeItemCollapsibleState.Collapsed, 'category'),
                new CalendarItem('📄 笔记管理', vscode.TreeItemCollapsibleState.Collapsed, 'category'),
                new CalendarItem('📁 文件过滤', vscode.TreeItemCollapsibleState.Collapsed, 'category'),
                new CalendarItem('📝 日记设置', vscode.TreeItemCollapsibleState.Collapsed, 'category'),
                new CalendarItem('📊 周报设置', vscode.TreeItemCollapsibleState.Collapsed, 'category'),
                new CalendarItem('🔧 工具', vscode.TreeItemCollapsibleState.Collapsed, 'category')
            ];
        }

        // 分类级别 - 显示设置
        if (element.label === '📂 笔记根目录') {
            const vscodeConfig = vscode.workspace.getConfiguration('memento');
            const configuredPath: string = vscodeConfig.get('notesPath', '');

            return [
                new CalendarItem(
                    `路径: ${configuredPath || '(使用当前工作区)'}`,
                    vscode.TreeItemCollapsibleState.None,
                    'action',
                    () => {
                        vscode.commands.executeCommand('workbench.action.openSettings', 'memento.notesPath');
                    }
                ),
                new CalendarItem(
                    '📂 在 VSCode 中打开笔记目录',
                    vscode.TreeItemCollapsibleState.None,
                    'command',
                    async () => {
                        const notesPath = await getNotesRootPath();
                        if (notesPath) {
                            const uri = vscode.Uri.file(notesPath);
                            await vscode.commands.executeCommand('vscode.openFolder', uri, { forceNewWindow: true });
                        } else {
                            vscode.window.showErrorMessage('未找到笔记目录');
                        }
                    }
                )
            ];
        }

        if (element.label === '📄 笔记管理') {
            return [
                new CalendarItem(
                    `新笔记默认路径: ${config.defaultNotePath}`,
                    vscode.TreeItemCollapsibleState.None,
                    'action',
                    async () => {
                        const input = await vscode.window.showInputBox({
                            prompt: '设置新笔记的默认存放路径',
                            value: config.defaultNotePath,
                            placeHolder: '例如: 未分类, 工作笔记, 学习笔记'
                        });
                        if (input !== undefined) {
                            const { saveMementoConfig } = await import('../config.js');
                            const newConfig = { ...config, defaultNotePath: input };
                            await saveMementoConfig(notesPath, newConfig);
                            vscode.window.showInformationMessage('✓ 默认笔记路径已更新');
                            this.refresh();
                        }
                    }
                )
            ];
        }

        if (element.label === '📁 文件过滤') {
            return [
                new CalendarItem(
                    `排除文件夹: ${config.excludeFolders.length > 0 ? config.excludeFolders.join(', ') : '(未设置)'}`,
                    vscode.TreeItemCollapsibleState.None,
                    'action',
                    async () => {
                        const input = await vscode.window.showInputBox({
                            prompt: '输入要排除的文件夹（逗号分隔）',
                            value: config.excludeFolders.join(', '),
                            placeHolder: '例如: node_modules, .git, temp*'
                        });
                        if (input !== undefined) {
                            const { saveMementoConfig } = await import('../config.js');
                            const newConfig = { ...config, excludeFolders: input.split(',').map(s => s.trim()).filter(s => s) };
                            await saveMementoConfig(notesPath, newConfig);
                            vscode.window.showInformationMessage('✓ 排除文件夹设置已更新');
                            this.refresh();
                        }
                    }
                )
            ];
        }

        if (element.label === '📝 日记设置') {
            return [
                new CalendarItem(
                    `存储路径: ${config.dailyNotesPath}`,
                    vscode.TreeItemCollapsibleState.None,
                    'action',
                    async () => {
                        const input = await vscode.window.showInputBox({
                            prompt: '日记存储路径',
                            value: config.dailyNotesPath,
                            placeHolder: '相对路径或绝对路径'
                        });
                        if (input !== undefined) {
                            const { saveMementoConfig } = await import('../config.js');
                            const newConfig = { ...config, dailyNotesPath: input };
                            await saveMementoConfig(notesPath, newConfig);
                            vscode.window.showInformationMessage('✓ 日记路径已更新');
                            this.refresh();
                        }
                    }
                ),
                new CalendarItem(
                    `文件名格式: ${config.dailyNoteFileNameFormat}`,
                    vscode.TreeItemCollapsibleState.None,
                    'action',
                    async () => {
                        const input = await vscode.window.showInputBox({
                            prompt: '日记文件名格式',
                            value: config.dailyNoteFileNameFormat,
                            placeHolder: '变量: {{year}} {{month}} {{day}} {{week}} {{title}} {{date}}'
                        });
                        if (input !== undefined) {
                            const { saveMementoConfig } = await import('../config.js');
                            const newConfig = { ...config, dailyNoteFileNameFormat: input };
                            await saveMementoConfig(notesPath, newConfig);
                            vscode.window.showInformationMessage('✓ 日记文件名格式已更新');
                            this.refresh();
                        }
                    }
                ),
                new CalendarItem(
                    `模板路径: ${config.dailyNoteTemplatePath || '(使用默认模板)'}`,
                    vscode.TreeItemCollapsibleState.None,
                    'action',
                    async () => {
                        const input = await vscode.window.showInputBox({
                            prompt: '日记模板文件路径',
                            value: config.dailyNoteTemplatePath,
                            placeHolder: '相对路径或绝对路径，留空使用默认模板'
                        });
                        if (input !== undefined) {
                            const { saveMementoConfig } = await import('../config.js');
                            const newConfig = { ...config, dailyNoteTemplatePath: input };
                            await saveMementoConfig(notesPath, newConfig);
                            vscode.window.showInformationMessage('✓ 日记模板路径已更新');
                            this.refresh();
                        }
                    }
                )
            ];
        }

        if (element.label === '📊 周报设置') {
            return [
                new CalendarItem(
                    `存储路径: ${config.weeklyNotesPath}`,
                    vscode.TreeItemCollapsibleState.None,
                    'action',
                    async () => {
                        const input = await vscode.window.showInputBox({
                            prompt: '周报存储路径',
                            value: config.weeklyNotesPath,
                            placeHolder: '相对路径或绝对路径'
                        });
                        if (input !== undefined) {
                            const { saveMementoConfig } = await import('../config.js');
                            const newConfig = { ...config, weeklyNotesPath: input };
                            await saveMementoConfig(notesPath, newConfig);
                            vscode.window.showInformationMessage('✓ 周报路径已更新');
                            this.refresh();
                        }
                    }
                ),
                new CalendarItem(
                    `文件名格式: ${config.weeklyNoteFileNameFormat}`,
                    vscode.TreeItemCollapsibleState.None,
                    'action',
                    async () => {
                        const input = await vscode.window.showInputBox({
                            prompt: '周报文件名格式',
                            value: config.weeklyNoteFileNameFormat,
                            placeHolder: '变量: {{year}} {{month}} {{day}} {{week}} {{title}} {{date}}'
                        });
                        if (input !== undefined) {
                            const { saveMementoConfig } = await import('../config.js');
                            const newConfig = { ...config, weeklyNoteFileNameFormat: input };
                            await saveMementoConfig(notesPath, newConfig);
                            vscode.window.showInformationMessage('✓ 周报文件名格式已更新');
                            this.refresh();
                        }
                    }
                ),
                new CalendarItem(
                    `模板路径: ${config.weeklyNoteTemplatePath || '(使用默认模板)'}`,
                    vscode.TreeItemCollapsibleState.None,
                    'action',
                    async () => {
                        const input = await vscode.window.showInputBox({
                            prompt: '周报模板文件路径',
                            value: config.weeklyNoteTemplatePath,
                            placeHolder: '相对路径或绝对路径，留空使用默认模板'
                        });
                        if (input !== undefined) {
                            const { saveMementoConfig } = await import('../config.js');
                            const newConfig = { ...config, weeklyNoteTemplatePath: input };
                            await saveMementoConfig(notesPath, newConfig);
                            vscode.window.showInformationMessage('✓ 周报模板路径已更新');
                            this.refresh();
                        }
                    }
                )
            ];
        }

        if (element.label === '🔧 工具') {
            return [
                new CalendarItem(
                    '填充 Front Matter Date 字段',
                    vscode.TreeItemCollapsibleState.None,
                    'command',
                    () => vscode.commands.executeCommand('memento.fillFrontMatterDate')
                )
            ];
        }

        return [];
    }
}

