/**
 * Memento 命令处理模块
 */

import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { PeriodicNoteType } from './types';
import { 
    getNotesRootPath, 
    loadMementoConfig, 
    resolveTemplatePath, 
    getDefaultDailyTemplate, 
    getDefaultWeeklyTemplate 
} from './config';
import { 
    getAllFolders, 
    getWeekNumber, 
    fillFrontMatterDateForAllFiles 
} from './utils';
import { CalendarItem, MainTreeProvider } from './providers';

/**
 * 打开周期性笔记（日记或周报）
 */
export async function openPeriodicNote(type: PeriodicNoteType): Promise<void> {
    const notesPath = await getNotesRootPath();
    if (!notesPath) {
        vscode.window.showErrorMessage('未找到笔记目录');
        return;
    }

    const config = await loadMementoConfig(notesPath);
    const now = new Date();

    let noteDir: string;
    let fileName: string;
    let title: string;
    let template: string;
    let dateStr: string;

    if (type === 'daily') {
        noteDir = path.isAbsolute(config.dailyNotesPath)
            ? config.dailyNotesPath
            : path.join(notesPath, config.dailyNotesPath);

        const year = now.getFullYear();
        const month = String(now.getMonth() + 1).padStart(2, '0');
        const day = String(now.getDate()).padStart(2, '0');
        const week = getWeekNumber(now);
        const weekPadded = String(week).padStart(2, '0');

        // 获取文件名格式
        fileName = config.dailyNoteFileNameFormat
            .replace(/\{\{year\}\}/g, String(year))
            .replace(/\{\{month\}\}/g, month)
            .replace(/\{\{day\}\}/g, day)
            .replace(/\{\{week\}\}/g, weekPadded);

        dateStr = `${year}-${month}-${day}`;
        title = `${year}年${month}月${day}日`;

        // 从文件加载模板或使用默认模板
        const resolvedTemplatePath = await resolveTemplatePath(config.dailyNoteTemplatePath, notesPath);

        if (resolvedTemplatePath) {
            try {
                template = await fs.promises.readFile(resolvedTemplatePath, 'utf-8');
            } catch (error) {
                vscode.window.showErrorMessage(`无法读取模板文件: ${resolvedTemplatePath}`);
                template = getDefaultDailyTemplate();
            }
        } else {
            template = getDefaultDailyTemplate();
        }

        template = template
            .replace(/\{\{date\}\}/g, dateStr)
            .replace(/\{\{title\}\}/g, title)
            .replace(/\{\{year\}\}/g, String(year))
            .replace(/\{\{month\}\}/g, month)
            .replace(/\{\{day\}\}/g, day)
            .replace(/\{\{week\}\}/g, weekPadded);
    } else {
        noteDir = path.isAbsolute(config.weeklyNotesPath)
            ? config.weeklyNotesPath
            : path.join(notesPath, config.weeklyNotesPath);

        const year = now.getFullYear();
        const month = String(now.getMonth() + 1).padStart(2, '0');
        const day = String(now.getDate()).padStart(2, '0');
        const week = getWeekNumber(now);
        const weekPadded = String(week).padStart(2, '0');

        // 获取文件名格式
        fileName = config.weeklyNoteFileNameFormat
            .replace(/\{\{year\}\}/g, String(year))
            .replace(/\{\{month\}\}/g, month)
            .replace(/\{\{day\}\}/g, day)
            .replace(/\{\{week\}\}/g, weekPadded);

        dateStr = `${year}-W${weekPadded}`;
        title = `${year}年第${week}周`;

        // 从文件加载模板或使用默认模板
        const resolvedTemplatePath = await resolveTemplatePath(config.weeklyNoteTemplatePath, notesPath);

        if (resolvedTemplatePath) {
            try {
                template = await fs.promises.readFile(resolvedTemplatePath, 'utf-8');
            } catch (error) {
                vscode.window.showErrorMessage(`无法读取模板文件: ${resolvedTemplatePath}`);
                template = getDefaultWeeklyTemplate();
            }
        } else {
            template = getDefaultWeeklyTemplate();
        }

        template = template
            .replace(/\{\{date\}\}/g, dateStr)
            .replace(/\{\{title\}\}/g, title)
            .replace(/\{\{year\}\}/g, String(year))
            .replace(/\{\{month\}\}/g, month)
            .replace(/\{\{day\}\}/g, day)
            .replace(/\{\{week\}\}/g, weekPadded);
    }

    // 确保目录存在
    try {
        await fs.promises.mkdir(noteDir, { recursive: true });
    } catch (error) {
        vscode.window.showErrorMessage(`无法创建目录: ${noteDir}`);
        return;
    }

    const filePath = path.join(noteDir, fileName);

    // 如果文件不存在则创建
    try {
        await fs.promises.access(filePath);
    } catch {
        // 文件不存在，使用模板创建
        await fs.promises.writeFile(filePath, template, 'utf-8');
    }

    // 打开文件
    const document = await vscode.workspace.openTextDocument(filePath);
    await vscode.window.showTextDocument(document);
}

/**
 * 创建新笔记
 */
export async function createNote(): Promise<void> {
    console.log('Create note command triggered');

    // 获取笔记根目录
    const notesPath = await getNotesRootPath();
    if (!notesPath) {
        vscode.window.showErrorMessage('未找到笔记目录');
        return;
    }

    // 步骤 1: 让用户选择或创建文件夹
    const folders = await getAllFolders(notesPath);

    // 添加特殊选项
    const folderOptions = [
        { label: '$(root-folder) 根目录', value: '' },
        { label: '$(new-folder) 新建文件夹...', value: '__new__' },
        ...folders.map(f => ({ label: `$(folder) ${f}`, value: f }))
    ];

    const selectedFolder = await vscode.window.showQuickPick(
        folderOptions.map(f => f.label),
        {
            placeHolder: '选择笔记存放的文件夹'
        }
    );

    if (!selectedFolder) {
        return; // 用户取消
    }

    let targetFolder = '';

    if (selectedFolder.includes('新建文件夹')) {
        // 创建新文件夹
        const newFolderName = await vscode.window.showInputBox({
            prompt: '请输入新文件夹名称',
            placeHolder: '例如: 工作笔记',
            validateInput: (value) => {
                if (!value) {
                    return '文件夹名称不能为空';
                }
                if (value.includes('/') || value.includes('\\')) {
                    return '文件夹名称不能包含 / 或 \\';
                }
                return null;
            }
        });

        if (!newFolderName) {
            return; // 用户取消
        }

        targetFolder = newFolderName;
    } else if (selectedFolder.includes('根目录')) {
        targetFolder = '';
    } else {
        // 从标签中提取文件夹名称
        const selectedOption = folderOptions.find(f => f.label === selectedFolder);
        targetFolder = selectedOption?.value || '';
    }

    // 步骤 2: 询问用户文件名
    const fileName = await vscode.window.showInputBox({
        prompt: '请输入笔记文件名',
        placeHolder: '例如: 我的笔记.md',
        validateInput: (value) => {
            if (!value) {
                return '文件名不能为空';
            }
            if (!value.endsWith('.md')) {
                return '文件名必须以 .md 结尾';
            }
            return null;
        }
    });

    if (!fileName) {
        return; // 用户取消
    }

    // 构建完整路径
    const fullPath = targetFolder
        ? path.join(notesPath, targetFolder, fileName)
        : path.join(notesPath, fileName);

    // 如果需要，创建目录
    const dirPath = path.dirname(fullPath);
    try {
        await fs.promises.mkdir(dirPath, { recursive: true });
    } catch (error) {
        vscode.window.showErrorMessage(`创建目录失败: ${error}`);
        return;
    }

    // 检查文件是否已存在
    try {
        await fs.promises.access(fullPath);
        vscode.window.showErrorMessage('文件已存在');
        return;
    } catch {
        // 文件不存在，继续
    }

    // 创建并打开文件
    try {
        // 创建带有基本 front matter 的文件
        const now = new Date();
        const dateStr = now.toISOString().split('T')[0];
        const content = `---
title: ${path.basename(fileName, '.md')}
date: ${dateStr}
tags: []
---

# ${path.basename(fileName, '.md')}

`;
        await fs.promises.writeFile(fullPath, content, 'utf-8');

        // 打开文件
        const doc = await vscode.workspace.openTextDocument(fullPath);
        await vscode.window.showTextDocument(doc);

        vscode.window.showInformationMessage('✓ 笔记创建成功');
    } catch (error) {
        vscode.window.showErrorMessage(`创建文件失败: ${error}`);
    }
}

/**
 * 填充 Front Matter Date 字段
 */
export async function fillFrontMatterDate(): Promise<void> {
    console.log('Fill Front Matter Date command triggered');
    const notesPath = await getNotesRootPath();
    if (!notesPath) {
        vscode.window.showErrorMessage('未找到笔记目录');
        return;
    }

    await fillFrontMatterDateForAllFiles(notesPath);
    vscode.window.showInformationMessage('Front Matter Date 字段填充完成');
}

/**
 * 执行日历操作
 */
export function executeCalendarAction(item: CalendarItem): void {
    console.log('Execute calendar action command triggered');
    if (item.action) {
        item.action();
    }
}

/**
 * 执行设置操作
 */
export function executeSettingAction(item: CalendarItem): void {
    console.log('Execute setting action command triggered');
    if (item.action) {
        item.action();
    }
}

/**
 * 执行设置命令
 */
export function executeSettingCommand(item: CalendarItem): void {
    console.log('Execute setting command triggered');
    if (item.action) {
        item.action();
    }
}

/**
 * 注册所有命令
 */
export function registerCommands(context: vscode.ExtensionContext, mainProvider: MainTreeProvider): void {
    // Hello World 命令
    const helloWorldDisposable = vscode.commands.registerCommand('memento.helloWorld', () => {
        vscode.window.showInformationMessage('Hello World from memento!');
    });

    // 列出 Markdown 文件命令
    const listMdFilesDisposable = vscode.commands.registerCommand('memento.listMdFiles', async () => {
        vscode.window.showInformationMessage('Use the Memento sidebar to view markdown files!');
    });

    // 视图切换命令
    const switchToFileViewDisposable = vscode.commands.registerCommand('memento.switchToFileView', () => {
        console.log('Switch to file view command triggered');
        mainProvider.switchToFileView();
    });

    const switchToTagViewDisposable = vscode.commands.registerCommand('memento.switchToTagView', () => {
        console.log('Switch to tag view command triggered');
        mainProvider.switchToTagView();
    });

    const switchToCalendarViewDisposable = vscode.commands.registerCommand('memento.switchToCalendarView', () => {
        console.log('Switch to calendar view command triggered');
        mainProvider.switchToCalendarView();
    });

    const switchToSettingsViewDisposable = vscode.commands.registerCommand('memento.switchToSettingsView', () => {
        console.log('Switch to settings view command triggered');
        mainProvider.switchToSettingsView();
    });

    // 刷新命令
    const refreshDisposable = vscode.commands.registerCommand('memento.refreshMdFiles', () => {
        console.log('Refresh command triggered');
        mainProvider.refresh();
    });

    // 日历和设置操作命令
    const executeCalendarActionDisposable = vscode.commands.registerCommand('memento.executeCalendarAction', executeCalendarAction);
    const executeSettingActionDisposable = vscode.commands.registerCommand('memento.executeSettingAction', executeSettingAction);
    const executeSettingCommandDisposable = vscode.commands.registerCommand('memento.executeSettingCommand', executeSettingCommand);

    // 工具命令
    const fillFrontMatterDateDisposable = vscode.commands.registerCommand('memento.fillFrontMatterDate', async () => {
        await fillFrontMatterDate();
        mainProvider.refresh();
    });

    // 笔记创建命令
    const openDailyNoteDisposable = vscode.commands.registerCommand('memento.openDailyNote', async () => {
        console.log('Open daily note command triggered');
        await openPeriodicNote('daily');
    });

    const openWeeklyNoteDisposable = vscode.commands.registerCommand('memento.openWeeklyNote', async () => {
        console.log('Open weekly note command triggered');
        await openPeriodicNote('weekly');
    });

    const createNoteDisposable = vscode.commands.registerCommand('memento.createNote', async () => {
        await createNote();
        mainProvider.refresh();
    });

    // 将所有命令添加到订阅中
    context.subscriptions.push(
        helloWorldDisposable,
        listMdFilesDisposable,
        switchToFileViewDisposable,
        switchToTagViewDisposable,
        switchToCalendarViewDisposable,
        switchToSettingsViewDisposable,
        refreshDisposable,
        executeCalendarActionDisposable,
        executeSettingActionDisposable,
        executeSettingCommandDisposable,
        fillFrontMatterDateDisposable,
        openDailyNoteDisposable,
        openWeeklyNoteDisposable,
        createNoteDisposable
    );
}
