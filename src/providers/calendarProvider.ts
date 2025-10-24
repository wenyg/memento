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

    constructor() {
        // CalendarProvider 初始化
    }

    refresh(): void {
        this._onDidChangeTreeData.fire();
    }

    getTreeItem(element: CalendarItem): vscode.TreeItem {
        return element;
    }

    async getChildren(element?: CalendarItem): Promise<CalendarItem[]> {
        if (!element) {
            // 根级别 - 显示最近的周报，每个周报可以展开显示对应的日报
            const items: CalendarItem[] = [
                new CalendarItem('📊 打开本周的周报', vscode.TreeItemCollapsibleState.None, 'action', () => {
                    vscode.commands.executeCommand('memento.openWeeklyNote');
                }),
                new CalendarItem('📝 打开今天的日记', vscode.TreeItemCollapsibleState.None, 'action', () => {
                    vscode.commands.executeCommand('memento.openDailyNote');
                })
            ];

            // 加载最近的周报作为可展开项目
            const recentWeeklyFiles = await this.loadRecentPeriodicNotes('weekly', 8);
            const weeklyItems = [];
            
            for (const weekFile of recentWeeklyFiles) {
                // 添加周数信息用于匹配日报
                const weekInfo = await this.extractWeekInfo(weekFile.label);
                
                // 根据是否能提取到周信息来决定是否可展开
                const collapsibleState = weekInfo ? 
                    vscode.TreeItemCollapsibleState.Collapsed : 
                    vscode.TreeItemCollapsibleState.None;
                
                const weekItem = new CalendarItem(
                    `📊 ${weekFile.label}`,
                    collapsibleState,
                    'week-item',
                    undefined,
                    weekFile.filePath
                );
                
                (weekItem as any).weekInfo = weekInfo;
                weeklyItems.push(weekItem);
            }

            items.push(...weeklyItems);
            return items;
        } else if (element.itemType === 'week-item') {
            // 展开周报时显示对应周的日报
            const weekInfo = (element as any).weekInfo;
            if (weekInfo) {
                const dailyItems = await this.loadDailyNotesForWeek(weekInfo.year, weekInfo.week);
                return dailyItems;
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

    /**
     * 从周报文件名中提取年份和周数信息（基于配置的文件名模板）
     */
    private async extractWeekInfo(fileName: string): Promise<{ year: number; week: number } | null> {
        try {
            const notesPath = await getNotesRootPath();
            if (!notesPath) {
                return null;
            }

            const config = await loadMementoConfig(notesPath);
            const template = config.weeklyNoteFileNameFormat;
            
            // 移除 .md 后缀（如果存在）
            const cleanFileName = fileName.replace(/\.md$/, '');
            
            // 将模板转换为正则表达式，并记录变量的位置
            let regexPattern = template.replace(/\.md$/, '');  // 移除模板中的 .md 后缀
            
            // 找到年份和周数在模板中的位置
            const yearIndex = regexPattern.indexOf('{{year}}');
            const weekIndex = regexPattern.indexOf('{{week}}');
            
            // 确定捕获组的顺序
            let yearGroup = 1;
            let weekGroup = 2;
            if (weekIndex < yearIndex) {
                yearGroup = 2;
                weekGroup = 1;
            }
            
            // 转义特殊字符并替换变量为捕获组
            regexPattern = regexPattern
                .replace(/[.*+?^${}()|[\]\\]/g, '\\$&')  // 转义所有正则特殊字符
                .replace(/\\\{\\\{year\\\}\\\}/g, '(\\d{4})')  // 年份：4位数字
                .replace(/\\\{\\\{week\\\}\\\}/g, '(\\d{1,2})');  // 周数：1-2位数字
            
            // 使用模板匹配
            const regex = new RegExp(`^${regexPattern}$`);
            const match = cleanFileName.match(regex);
            
            if (match) {
                const year = parseInt(match[yearGroup]);
                const week = parseInt(match[weekGroup]);
                
                return { year, week };
            } else {
                return null;
            }
        } catch (error) {
            console.error(`[Calendar] 提取周报信息失败:`, error);
            return null;
        }
    }

    /**
     * 加载指定周的所有日报
     */
    private async loadDailyNotesForWeek(year: number, week: number): Promise<CalendarItem[]> {
        const notesPath = await getNotesRootPath();
        if (!notesPath) {
            return [];
        }

        const config = await loadMementoConfig(notesPath);
        const customPath: string = config.dailyNotesPath;
        const noteDir = path.isAbsolute(customPath) ? customPath : path.join(notesPath, customPath);

        // 检查目录是否存在
        try {
            await fs.promises.access(noteDir);
        } catch {
            return [];
        }

        // 计算该周的日期范围
        const weekDates = this.getWeekDates(year, week);
        
        try {
            const files = await fs.promises.readdir(noteDir);
            const mdFiles = files.filter(f => f.endsWith('.md'));

            // 根据命名模式过滤该周的日报文件
            const fileNamePattern = config.dailyNoteFileNameFormat;
            const dailyFiles: CalendarItem[] = [];

            for (const date of weekDates) {
                const expectedFileName = fileNamePattern
                    .replace(/\{\{year\}\}/g, date.getFullYear().toString())
                    .replace(/\{\{month\}\}/g, String(date.getMonth() + 1).padStart(2, '0'))
                    .replace(/\{\{day\}\}/g, String(date.getDate()).padStart(2, '0'))
                    .replace(/\{\{week\}\}/g, String(week).padStart(2, '0'));  // 替换周数

                if (mdFiles.includes(expectedFileName)) {
                    const filePath = path.join(noteDir, expectedFileName);
                    const displayName = `📝 ${date.getMonth() + 1}/${date.getDate()} ${this.getWeekdayName(date.getDay())}`;
                    
                    dailyFiles.push(new CalendarItem(
                        displayName,
                        vscode.TreeItemCollapsibleState.None,
                        'file',
                        undefined,
                        filePath
                    ));
                }
            }

            return dailyFiles;
        } catch (error) {
            console.error(`Error loading daily notes for week ${year}-W${week}:`, error);
            return [];
        }
    }

    /**
     * 获取指定年份和周数对应的日期数组（ISO 8601 标准）
     */
    private getWeekDates(year: number, week: number): Date[] {
        // ISO 8601 标准：每年第一周是包含1月4日的那一周
        const jan4 = new Date(year, 0, 4);
        const jan4DayOfWeek = jan4.getDay() || 7; // 周日=7, 周一=1
        
        // 计算第一周的周一
        const firstMonday = new Date(jan4);
        firstMonday.setDate(jan4.getDate() - jan4DayOfWeek + 1);
        
        // 计算目标周的周一
        const targetMonday = new Date(firstMonday);
        targetMonday.setDate(firstMonday.getDate() + (week - 1) * 7);

        // 生成该周的7天日期
        const weekDates: Date[] = [];
        for (let i = 0; i < 7; i++) {
            const date = new Date(targetMonday);
            date.setDate(targetMonday.getDate() + i);
            weekDates.push(date);
        }

        return weekDates;
    }

    /**
     * 获取星期几的中文名称
     */
    private getWeekdayName(dayOfWeek: number): string {
        const weekdays = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];
        return weekdays[dayOfWeek];
    }
}
