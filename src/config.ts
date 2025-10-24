/**
 * Memento 配置管理模块
 */

import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { MementoConfig } from './types';

export const DEFAULT_CONFIG: MementoConfig = {
    excludeFolders: ['node_modules', '.git'],
    dailyNotesPath: 'daily',
    dailyNoteFileNameFormat: '{{year}}-{{month}}-{{day}}.md',
    dailyNoteTemplatePath: '',
    weeklyNotesPath: 'weekly',
    weeklyNoteFileNameFormat: '{{year}}-W{{week}}.md',
    weeklyNoteTemplatePath: ''
};

/**
 * 获取笔记根目录路径
 */
export async function getNotesRootPath(): Promise<string | null> {
    const config = vscode.workspace.getConfiguration('memento');
    const configuredPath: string = config.get('notesPath', '');

    // 如果用户配置了笔记路径，使用它
    if (configuredPath) {
        try {
            const stats = await fs.promises.stat(configuredPath);
            if (stats.isDirectory()) {
                return configuredPath;
            } else {
                vscode.window.showErrorMessage(`配置的笔记路径不是一个有效的目录: ${configuredPath}`);
                return null;
            }
        } catch (error) {
            vscode.window.showErrorMessage(`配置的笔记路径不存在: ${configuredPath}`);
            return null;
        }
    }

    // 否则，使用第一个工作区文件夹
    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (!workspaceFolders || workspaceFolders.length === 0) {
        return null;
    }

    return workspaceFolders[0].uri.fsPath;
}

/**
 * 加载 Memento 配置
 */
export async function loadMementoConfig(notesPath: string): Promise<MementoConfig> {
    const configPath = path.join(notesPath, '.memento', 'config.json');

    try {
        await fs.promises.access(configPath);
        const configContent = await fs.promises.readFile(configPath, 'utf-8');
        const userConfig = JSON.parse(configContent);
        return { ...DEFAULT_CONFIG, ...userConfig };
    } catch (error) {
        // 配置文件不存在，返回默认配置
        return { ...DEFAULT_CONFIG };
    }
}

/**
 * 保存 Memento 配置
 */
export async function saveMementoConfig(notesPath: string, config: MementoConfig): Promise<void> {
    const configDir = path.join(notesPath, '.memento');
    const configPath = path.join(configDir, 'config.json');

    try {
        // 确保 .memento 目录存在
        await fs.promises.mkdir(configDir, { recursive: true });

        // 保存配置
        await fs.promises.writeFile(configPath, JSON.stringify(config, null, 2), 'utf-8');
    } catch (error) {
        console.error('Error saving config:', error);
        throw error;
    }
}

/**
 * 解析模板路径
 */
export async function resolveTemplatePath(templatePath: string, notesPath: string): Promise<string> {
    // 如果为空，返回空以使用默认模板
    if (!templatePath) {
        return '';
    }

    // 检查是否为绝对路径
    if (path.isAbsolute(templatePath)) {
        return templatePath;
    }

    // 相对路径，相对于笔记根目录解析
    return path.join(notesPath, templatePath);
}

/**
 * 获取默认日记模板
 */
export function getDefaultDailyTemplate(): string {
    return `---
date: {{date}}
title: {{title}}
tags: [daily]
---

# {{title}}

`;
}

/**
 * 获取默认周报模板
 */
export function getDefaultWeeklyTemplate(): string {
    return `---
date: {{date}}
title: {{title}}
tags: [weekly]
---

# {{title}}

## 本周总结

## 下周计划

`;
}
