/**
 * 日历提供者
 */

import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { getNotesRootPath, loadMementoConfig } from '../config';
import { CalendarItem } from './base';

export class CalendarProvider implements vscode.TreeDataProvider<CalendarItem> {
    private _onDidChangeTreeData: vscode.EventEmitter<CalendarItem | undefined | null | void> = new vscode.EventEmitter<CalendarItem | undefined | null | void>();
    readonly onDidChangeTreeData: vscode.Event<CalendarItem | undefined | null | void> = this._onDidChangeTreeData.event;

    refresh(): void {
        this._onDidChangeTreeData.fire();
    }

    getTreeItem(element: CalendarItem): vscode.TreeItem {
        return element;
    }

    async getChildren(element?: CalendarItem): Promise<CalendarItem[]> {
        if (!element) {
            // 根级别 - 显示日记和周报分类
            return [
                new CalendarItem('Daily Notes', vscode.TreeItemCollapsibleState.Expanded, 'daily'),
                new CalendarItem('Weekly Notes', vscode.TreeItemCollapsibleState.Expanded, 'weekly')
            ];
        } else {
            // 显示操作按钮和最近文件
            if (element.itemType === 'daily') {
                const items: CalendarItem[] = [
                    new CalendarItem('📝 打开今天的日记', vscode.TreeItemCollapsibleState.None, 'action', () => {
                        vscode.commands.executeCommand('memento.openDailyNote');
                    })
                ];

                // 加载最近的日记
                const recentFiles = await this.loadRecentPeriodicNotes('daily', 10);
                items.push(...recentFiles);

                return items;
            } else if (element.itemType === 'weekly') {
                const items: CalendarItem[] = [
                    new CalendarItem('📊 打开本周的周报', vscode.TreeItemCollapsibleState.None, 'action', () => {
                        vscode.commands.executeCommand('memento.openWeeklyNote');
                    })
                ];

                // 加载最近的周报
                const recentFiles = await this.loadRecentPeriodicNotes('weekly', 10);
                items.push(...recentFiles);

                return items;
            }
        }

        return [];
    }

    private async loadRecentPeriodicNotes(type: 'daily' | 'weekly', limit: number): Promise<CalendarItem[]> {
        const notesPath = await getNotesRootPath();
        if (!notesPath) {
            return [];
        }

        const config = await loadMementoConfig(notesPath);
        let noteDir: string;

        if (type === 'daily') {
            const customPath: string = config.dailyNotesPath;
            noteDir = path.isAbsolute(customPath) ? customPath : path.join(notesPath, customPath);
        } else {
            const customPath: string = config.weeklyNotesPath;
            noteDir = path.isAbsolute(customPath) ? customPath : path.join(notesPath, customPath);
        }

        // 检查目录是否存在
        try {
            await fs.promises.access(noteDir);
        } catch {
            return [];
        }

        // 读取目录中的所有文件
        try {
            const files = await fs.promises.readdir(noteDir);
            const mdFiles = files.filter(f => f.endsWith('.md'));

            // 根据命名模式过滤文件
            const fileNamePattern = type === 'daily' ? config.dailyNoteFileNameFormat : config.weeklyNoteFileNameFormat;
            const regexPattern = fileNamePattern
                .replace(/\{\{year\}\}/g, '(\\d{4})')
                .replace(/\{\{month\}\}/g, '(\\d{2})')
                .replace(/\{\{day\}\}/g, '(\\d{2})')
                .replace(/\{\{week\}\}/g, '(\\d{2})')
                .replace(/\./g, '\\.');
            const regex = new RegExp(`^${regexPattern}$`);

            const fileStats = mdFiles
                .map(fileName => {
                    const match = fileName.match(regex);
                    if (!match) {
                        return null;
                    }

                    const filePath = path.join(noteDir, fileName);
                    let sortKey: string;

                    if (type === 'daily') {
                        // 根据模式从文件名提取年、月、日
                        const yearIndex = fileNamePattern.indexOf('{{year}}');
                        const monthIndex = fileNamePattern.indexOf('{{month}}');
                        const dayIndex = fileNamePattern.indexOf('{{day}}');

                        const positions = [
                            { index: yearIndex, groupIndex: 1 },
                            { index: monthIndex, groupIndex: 2 },
                            { index: dayIndex, groupIndex: 3 }
                        ].sort((a, b) => a.index - b.index);

                        const year = match[positions.findIndex(p => p.index === yearIndex) + 1];
                        const month = match[positions.findIndex(p => p.index === monthIndex) + 1];
                        const day = match[positions.findIndex(p => p.index === dayIndex) + 1];

                        sortKey = `${year}${month}${day}`;
                    } else {
                        // 根据模式从文件名提取年和周
                        const yearIndex = fileNamePattern.indexOf('{{year}}');
                        const weekIndex = fileNamePattern.indexOf('{{week}}');

                        const positions = [
                            { index: yearIndex, groupIndex: 1 },
                            { index: weekIndex, groupIndex: 2 }
                        ].sort((a, b) => a.index - b.index);

                        const year = match[positions.findIndex(p => p.index === yearIndex) + 1];
                        const week = match[positions.findIndex(p => p.index === weekIndex) + 1];

                        sortKey = `${year}${week}`;
                    }

                    return {
                        fileName,
                        filePath,
                        sortKey
                    };
                })
                .filter((f): f is { fileName: string; filePath: string; sortKey: string } => f !== null);

            // 按日期排序（最新的在前）
            fileStats.sort((a, b) => b.sortKey.localeCompare(a.sortKey));

            // 返回最近的文件
            return fileStats.slice(0, limit).map(file => {
                const displayName = file.fileName.replace('.md', '');
                return new CalendarItem(
                    displayName,
                    vscode.TreeItemCollapsibleState.None,
                    'file',
                    undefined,
                    file.filePath
                );
            });
        } catch (error) {
            console.error(`Error loading ${type} notes:`, error);
            return [];
        }
    }
}
