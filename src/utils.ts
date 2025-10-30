/**
 * Memento 工具函数模块
 */

import * as fs from 'fs';
import * as path from 'path';
import { MdFileInfo, FrontMatter, TodoItem, TodoPriority } from './types';
import { loadMementoConfig } from './config';

/**
 * 检查是否应该排除文件夹
 */
export function shouldExcludeFolder(folderName: string, excludeFolders: string[]): boolean {
    // 检查是否以点开头（隐藏文件夹）
    if (folderName.startsWith('.')) {
        return true;
    }

    // 检查排除列表（支持简单通配符匹配）
    for (const pattern of excludeFolders) {
        if (pattern.includes('*')) {
            // 简单通配符匹配
            const regexPattern = pattern.replace(/\*/g, '.*');
            const regex = new RegExp(`^${regexPattern}$`);
            if (regex.test(folderName)) {
                return true;
            }
        } else {
            // 精确匹配
            if (folderName === pattern) {
                return true;
            }
        }
    }

    return false;
}

/**
 * 解析 Front Matter
 */
export function parseFrontMatter(content: string): FrontMatter | null {
    if (!content.startsWith('---\n') && !content.startsWith('---\r\n')) {
        return null;
    }

    const endMatch = content.match(/\n---\n|\r\n---\r\n|\n---\r\n|\r\n---\n/);
    if (!endMatch || !endMatch.index) {
        return null;
    }

    const frontMatterContent = content.substring(4, endMatch.index);
    const frontMatter: FrontMatter = {};

    // 简单的 YAML 解析器，用于常见字段
    const lines = frontMatterContent.split(/\r?\n/);
    let i = 0;
    while (i < lines.length) {
        const line = lines[i];
        const match = line.match(/^(\w+):\s*(.*)$/);
        if (match) {
            const key = match[1];
            let value: any = match[2].trim();

            // 处理内联数组格式: tags: [tag1, tag2]
            if (value.startsWith('[') && value.endsWith(']')) {
                value = value.slice(1, -1).split(',').map((v: string) => v.trim().replace(/['"]/g, ''));
                frontMatter[key] = value;
                i++;
                continue;
            }

            // 处理多行数组格式:
            // tags:
            //   - tag1
            //   - tag2
            if (value === '' || value === '[]') {
                const arrayItems: string[] = [];
                i++;
                while (i < lines.length) {
                    const nextLine = lines[i];
                    const arrayMatch = nextLine.match(/^\s*-\s*(.+)$/);
                    if (arrayMatch) {
                        let item = arrayMatch[1].trim();
                        // 移除引号（如果存在）
                        if ((item.startsWith('"') && item.endsWith('"')) ||
                            (item.startsWith("'") && item.endsWith("'"))) {
                            item = item.slice(1, -1);
                        }
                        arrayItems.push(item);
                        i++;
                    } else if (nextLine.trim() === '') {
                        // 跳过空行
                        i++;
                    } else {
                        // 数组结束
                        break;
                    }
                }
                if (arrayItems.length > 0) {
                    frontMatter[key] = arrayItems;
                }
                continue;
            }

            // 移除引号（如果存在）
            if ((value.startsWith('"') && value.endsWith('"')) ||
                (value.startsWith("'") && value.endsWith("'"))) {
                value = value.slice(1, -1);
            }

            frontMatter[key] = value;
        }
        i++;
    }

    return frontMatter;
}

/**
 * 移除代码块
 */
export function removeCodeBlocks(content: string): string {
    // 移除围栏代码块 (```...```)
    let result = content.replace(/```[\s\S]*?```/g, '');

    // 移除内联代码 (`...`)
    result = result.replace(/`[^`]+`/g, '');

    return result;
}

/**
 * 从文件中提取标签
 */
export async function extractTagsFromFile(filePath: string): Promise<string[]> {
    try {
        const content = await fs.promises.readFile(filePath, 'utf-8');
        const tags: string[] = [];

        // 首先，尝试从 Front Matter 获取标签
        const frontMatter = parseFrontMatter(content);
        if (frontMatter && frontMatter.tags) {
            if (Array.isArray(frontMatter.tags)) {
                tags.push(...frontMatter.tags);
            } else if (typeof frontMatter.tags === 'string') {
                tags.push(frontMatter.tags);
            }
        }

        // 移除代码块以避免在代码中匹配标签
        const contentWithoutCode = removeCodeBlocks(content);

        // 匹配 #tag 或 #level1/level2 模式，支持中文字符
        // \p{L} 匹配任何 Unicode 字母（包括中文），\p{N} 匹配任何 Unicode 数字
        const tagRegex = /#([\p{L}\p{N}_\-\/]+)/gu;
        let match;

        while ((match = tagRegex.exec(contentWithoutCode)) !== null) {
            const tag = match[1];
            if (!tags.includes(tag)) {
                tags.push(tag);
            }
        }

        return tags;
    } catch (error) {
        console.error(`Error reading file ${filePath}:`, error);
        return [];
    }
}

/**
 * 提取第一个标题
 */
export async function extractFirstHeading(filePath: string): Promise<string> {
    try {
        const content = await fs.promises.readFile(filePath, 'utf-8');

        // 首先，尝试从 Front Matter 获取标题
        const frontMatter = parseFrontMatter(content);
        if (frontMatter && frontMatter.title) {
            return frontMatter.title;
        }

        // 移除代码块以避免在代码中匹配标题
        const contentWithoutCode = removeCodeBlocks(content);

        // 匹配第一个一级标题 (# title)
        const headingMatch = contentWithoutCode.match(/^#\s+(.+)$/m);
        if (headingMatch) {
            return headingMatch[1].trim();
        }

        // 如果没有找到标题，返回不带扩展名的文件名
        const fileName = path.basename(filePath, '.md');
        return fileName;
    } catch (error) {
        console.error(`Error reading file ${filePath}:`, error);
        // 回退到不带扩展名的文件名
        return path.basename(filePath, '.md');
    }
}

/**
 * 查找 Markdown 文件
 */
export async function findMarkdownFiles(dir: string): Promise<MdFileInfo[]> {
    const mdFiles: MdFileInfo[] = [];
    const config = await loadMementoConfig(dir);

    async function scanDirectory(currentDir: string, rootDir: string) {
        const items = await fs.promises.readdir(currentDir);

        for (const item of items) {
            const itemPath = path.join(currentDir, item);
            const stats = await fs.promises.stat(itemPath);

            if (stats.isDirectory()) {
                // 跳过排除的目录
                if (!shouldExcludeFolder(item, config.excludeFolders)) {
                    await scanDirectory(itemPath, rootDir);
                }
            } else if (stats.isFile() && path.extname(item).toLowerCase() === '.md') {
                const relativePath = path.relative(rootDir, itemPath);
                const displayTitle = await extractFirstHeading(itemPath);

                // 尝试从 Front Matter 获取日期
                let birthtime = stats.birthtime;
                try {
                    const content = await fs.promises.readFile(itemPath, 'utf-8');
                    const frontMatter = parseFrontMatter(content);
                    if (frontMatter && frontMatter.date) {
                        const parsedDate = new Date(frontMatter.date);
                        if (!isNaN(parsedDate.getTime())) {
                            birthtime = parsedDate;
                        }
                    }
                } catch (error) {
                    // 如果 Front Matter 解析失败，使用文件创建时间
                }

                mdFiles.push({
                    path: itemPath,
                    birthtime: birthtime,
                    relativePath: relativePath,
                    displayTitle: displayTitle
                });
            }
        }
    }

    await scanDirectory(dir, dir);
    return mdFiles;
}

/**
 * 查找带标签的 Markdown 文件
 */
export async function findMarkdownFilesWithTags(dir: string): Promise<MdFileInfo[]> {
    const mdFiles: MdFileInfo[] = [];
    const config = await loadMementoConfig(dir);

    async function scanDirectory(currentDir: string, rootDir: string) {
        const items = await fs.promises.readdir(currentDir);

        for (const item of items) {
            const itemPath = path.join(currentDir, item);
            const stats = await fs.promises.stat(itemPath);

            if (stats.isDirectory()) {
                // 跳过排除的目录
                if (!shouldExcludeFolder(item, config.excludeFolders)) {
                    await scanDirectory(itemPath, rootDir);
                }
            } else if (stats.isFile() && path.extname(item).toLowerCase() === '.md') {
                const relativePath = path.relative(rootDir, itemPath);
                const displayTitle = await extractFirstHeading(itemPath);
                const tags = await extractTagsFromFile(itemPath);

                // 尝试从 Front Matter 获取日期
                let birthtime = stats.birthtime;
                try {
                    const content = await fs.promises.readFile(itemPath, 'utf-8');
                    const frontMatter = parseFrontMatter(content);
                    if (frontMatter && frontMatter.date) {
                        const parsedDate = new Date(frontMatter.date);
                        if (!isNaN(parsedDate.getTime())) {
                            birthtime = parsedDate;
                        }
                    }
                } catch (error) {
                    // 如果 Front Matter 解析失败，使用文件创建时间
                }

                mdFiles.push({
                    path: itemPath,
                    birthtime: birthtime,
                    relativePath: relativePath,
                    displayTitle: displayTitle,
                    tags: tags
                });
            }
        }
    }

    await scanDirectory(dir, dir);
    return mdFiles;
}

/**
 * 获取所有文件夹
 */
export async function getAllFolders(rootPath: string): Promise<string[]> {
    const folders: string[] = [];
    const config = await loadMementoConfig(rootPath);

    async function scanDirectory(currentDir: string, relativePath: string = '') {
        const items = await fs.promises.readdir(currentDir);

        for (const item of items) {
            const itemPath = path.join(currentDir, item);
            const stats = await fs.promises.stat(itemPath);

            if (stats.isDirectory()) {
                // 跳过排除的目录
                if (!shouldExcludeFolder(item, config.excludeFolders)) {
                    const folderRelativePath = relativePath ? path.join(relativePath, item) : item;
                    folders.push(folderRelativePath);
                    await scanDirectory(itemPath, folderRelativePath);
                }
            }
        }
    }

    await scanDirectory(rootPath);
    return folders.sort();
}

/**
 * 获取周数
 */
export function getWeekNumber(date: Date): number {
    const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
    const dayNum = d.getUTCDay() || 7;
    d.setUTCDate(d.getUTCDate() + 4 - dayNum);
    const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
    return Math.ceil((((d.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
}

/**
 * 为单个文件填充 Front Matter Date 字段
 */
export async function fillFrontMatterDateForFile(filePath: string): Promise<boolean> {
    try {
        const content = await fs.promises.readFile(filePath, 'utf-8');
        const stats = await fs.promises.stat(filePath);

        // 检查文件是否已有 front matter
        const hasFrontMatter = content.startsWith('---\n');

        let newContent: string;

        if (hasFrontMatter) {
            // 解析现有的 front matter
            const endOfFrontMatter = content.indexOf('\n---\n', 4);
            if (endOfFrontMatter === -1) {
                return false; // 无效的 front matter
            }

            const frontMatterContent = content.substring(4, endOfFrontMatter);
            const restContent = content.substring(endOfFrontMatter + 5);

            // 检查是否已存在 date 字段
            if (frontMatterContent.match(/^date:/m)) {
                return false; // 已有 date 字段
            }

            // 添加 date 字段
            const dateStr = stats.birthtime.toISOString().split('T')[0];
            newContent = `---\n${frontMatterContent}\ndate: ${dateStr}\n---\n${restContent}`;
        } else {
            // 创建新的 front matter
            const dateStr = stats.birthtime.toISOString().split('T')[0];
            newContent = `---\ndate: ${dateStr}\n---\n\n${content}`;
        }

        await fs.promises.writeFile(filePath, newContent, 'utf-8');
        return true;
    } catch (error) {
        console.error(`Error processing file ${filePath}:`, error);
        return false;
    }
}

/**
 * 为所有文件填充 Front Matter Date 字段
 */
export async function fillFrontMatterDateForAllFiles(dir: string): Promise<void> {
    const mdFiles: string[] = [];
    const config = await loadMementoConfig(dir);

    async function scanDirectory(currentDir: string) {
        const items = await fs.promises.readdir(currentDir);

        for (const item of items) {
            const itemPath = path.join(currentDir, item);
            const stats = await fs.promises.stat(itemPath);

            if (stats.isDirectory()) {
                if (!shouldExcludeFolder(item, config.excludeFolders)) {
                    await scanDirectory(itemPath);
                }
            } else if (stats.isFile() && path.extname(item).toLowerCase() === '.md') {
                mdFiles.push(itemPath);
            }
        }
    }

    await scanDirectory(dir);

    let processedCount = 0;
    for (const filePath of mdFiles) {
        const updated = await fillFrontMatterDateForFile(filePath);
        if (updated) {
            processedCount++;
        }
    }

    console.log(`Processed ${processedCount} files`);
}

/**
 * 解析 TODO 行的属性
 * 支持格式: - [ ] todo content #tag1 #tag2 project:my_project due:2023-01-01 end_time:2023-01-02 priority:H
 */
export function parseTodoAttributes(line: string): {
    content: string;
    tags: string[];
    project?: string;
    due?: string;
    endTime?: string;
    priority: TodoPriority;
} {
    let content = line;
    const tags: string[] = [];
    let project: string | undefined;
    let due: string | undefined;
    let endTime: string | undefined;
    let priority: TodoPriority = TodoPriority.NONE;

    // 提取标签 #tag
    const tagMatches = content.matchAll(/#([\p{L}\p{N}_\-\/]+)/gu);
    for (const match of tagMatches) {
        tags.push(match[1]);
    }

    // 提取项目 project:name
    const projectMatch = content.match(/project:([\p{L}\p{N}_\-\/]+)/u);
    if (projectMatch) {
        project = projectMatch[1];
    }

    // 提取截止日期 due:YYYY-MM-DD
    const dueMatch = content.match(/due:(\d{4}-\d{2}-\d{2})/);
    if (dueMatch) {
        due = dueMatch[1];
    }

    // 提取完成时间 end_time:YYYY-MM-DD
    const endTimeMatch = content.match(/end_time:(\d{4}-\d{2}-\d{2})/);
    if (endTimeMatch) {
        endTime = endTimeMatch[1];
    }

    // 提取优先级 priority:H/M/L
    const priorityMatch = content.match(/priority:([HML])/);
    if (priorityMatch) {
        priority = priorityMatch[1] as TodoPriority;
    }

    // 移除所有属性标记，只保留内容
    content = content
        .replace(/#[\p{L}\p{N}_\-\/]+/gu, '')
        .replace(/project:[\p{L}\p{N}_\-\/]+/gu, '')
        .replace(/due:\d{4}-\d{2}-\d{2}/g, '')
        .replace(/end_time:\d{4}-\d{2}-\d{2}/g, '')
        .replace(/priority:[HML]/g, '')
        .trim();

    return { content, tags, project, due, endTime, priority };
}

/**
 * 从文件中提取所有 TODO 项
 */
export async function extractTodosFromFile(filePath: string): Promise<TodoItem[]> {
    try {
        const content = await fs.promises.readFile(filePath, 'utf-8');
        const lines = content.split(/\r?\n/);
        const todos: TodoItem[] = [];
        const fileName = path.basename(filePath);

        for (let i = 0; i < lines.length; i++) {
            const line = lines[i];
            
            // 匹配 TODO 行: - [ ] 或 - [x]
            const todoMatch = line.match(/^(\s*)- \[([ xX])\]\s+(.+)$/);
            if (todoMatch) {
                const indent = todoMatch[1];
                const checked = todoMatch[2].toLowerCase() === 'x';
                const todoContent = todoMatch[3];

                // 计算缩进级别
                const level = Math.floor(indent.length / 4);

                // 解析属性
                const attributes = parseTodoAttributes(todoContent);

                todos.push({
                    filePath,
                    fileName,
                    lineNumber: i + 1,
                    content: attributes.content,
                    completed: checked,
                    level,
                    tags: attributes.tags,
                    project: attributes.project,
                    due: attributes.due,
                    endTime: attributes.endTime,
                    priority: attributes.priority
                });
            }
        }

        return todos;
    } catch (error) {
        console.error(`Error reading file ${filePath}:`, error);
        return [];
    }
}

/**
 * 从目录中提取所有 TODO 项
 */
export async function extractTodosFromDirectory(dir: string): Promise<TodoItem[]> {
    const allTodos: TodoItem[] = [];
    const config = await loadMementoConfig(dir);

    async function scanDirectory(currentDir: string) {
        const items = await fs.promises.readdir(currentDir);

        for (const item of items) {
            const itemPath = path.join(currentDir, item);
            const stats = await fs.promises.stat(itemPath);

            if (stats.isDirectory()) {
                if (!shouldExcludeFolder(item, config.excludeFolders)) {
                    await scanDirectory(itemPath);
                }
            } else if (stats.isFile() && path.extname(item).toLowerCase() === '.md') {
                const todos = await extractTodosFromFile(itemPath);
                allTodos.push(...todos);
            }
        }
    }

    await scanDirectory(dir);
    return allTodos;
}

/**
 * 切换 TODO 项的完成状态
 */
export async function toggleTodoStatus(todo: TodoItem): Promise<boolean> {
    try {
        const content = await fs.promises.readFile(todo.filePath, 'utf-8');
        const lines = content.split(/\r?\n/);

        if (todo.lineNumber > 0 && todo.lineNumber <= lines.length) {
            const line = lines[todo.lineNumber - 1];
            
            let newLine: string;
            if (todo.completed) {
                // 从完成变为未完成：移除 end_time
                newLine = line
                    .replace(/- \[x\]/i, '- [ ]')
                    .replace(/\s*end_time:\d{4}-\d{2}-\d{2}/g, '');
            } else {
                // 从未完成变为完成：添加 end_time
                const today = new Date().toISOString().split('T')[0];
                newLine = line.replace(/- \[ \]/, '- [x]');
                
                // 如果还没有 end_time，添加它
                if (!newLine.includes('end_time:')) {
                    // 在行尾添加 end_time（在其他属性之后）
                    newLine = `${newLine} end_time:${today}`;
                }
            }

            lines[todo.lineNumber - 1] = newLine;
            await fs.promises.writeFile(todo.filePath, lines.join('\n'), 'utf-8');
            return true;
        }

        return false;
    } catch (error) {
        console.error(`Error toggling todo status:`, error);
        return false;
    }
}

/**
 * 更新 TODO 项的属性
 */
export async function updateTodoAttributes(
    todo: TodoItem,
    updates: {
        tags?: string[];
        project?: string;
        due?: string;
        priority?: TodoPriority;
    }
): Promise<boolean> {
    try {
        const content = await fs.promises.readFile(todo.filePath, 'utf-8');
        const lines = content.split(/\r?\n/);

        if (todo.lineNumber <= 0 || todo.lineNumber > lines.length) {
            return false;
        }

        const line = lines[todo.lineNumber - 1];
        
        // 匹配 TODO 行格式: - [ ] 或 - [x]
        const todoMatch = line.match(/^(\s*)- \[([ xX])\]\s+(.+)$/);
        if (!todoMatch) {
            return false;
        }

        const indent = todoMatch[1];
        const checked = todoMatch[2];
        let todoContent = todoMatch[3];

        // 保存原有的 end_time（如果存在）
        const endTimeMatch = todoContent.match(/end_time:(\d{4}-\d{2}-\d{2})/);
        const existingEndTime = endTimeMatch ? endTimeMatch[1] : undefined;

        // 移除现有的所有属性
        todoContent = todoContent
            .replace(/#[\p{L}\p{N}_\-\/]+/gu, '')
            .replace(/project:[\p{L}\p{N}_\-\/]+/gu, '')
            .replace(/due:\d{4}-\d{2}-\d{2}/g, '')
            .replace(/end_time:\d{4}-\d{2}-\d{2}/g, '')
            .replace(/priority:[HML]/g, '')
            .trim();

        // 构建新的属性字符串，保留未更新的原有属性
        const attributes: string[] = [];

        // 添加标签 - 如果更新中包含 tags，使用新值；否则保留原值
        const finalTags = updates.tags !== undefined ? updates.tags : todo.tags;
        if (finalTags && finalTags.length > 0) {
            finalTags.forEach(tag => {
                attributes.push(`#${tag}`);
            });
        }

        // 添加项目 - 如果更新中包含 project，使用新值；否则保留原值
        const finalProject = updates.project !== undefined ? updates.project : todo.project;
        if (finalProject) {
            attributes.push(`project:${finalProject}`);
        }

        // 添加截止日期 - 如果更新中包含 due，使用新值；否则保留原值
        const finalDue = updates.due !== undefined ? updates.due : todo.due;
        if (finalDue) {
            attributes.push(`due:${finalDue}`);
        }

        // 添加优先级 - 如果更新中包含 priority，使用新值；否则保留原值
        const finalPriority: TodoPriority = updates.priority !== undefined ? updates.priority : todo.priority;
        if (finalPriority) {
            attributes.push(`priority:${finalPriority}`);
        }

        // 添加完成时间 - 保留原有的 end_time（只有在任务已完成时才保留）
        if (checked.toLowerCase() === 'x' && existingEndTime) {
            attributes.push(`end_time:${existingEndTime}`);
        }

        // 重建 TODO 行
        const newLine = `${indent}- [${checked}] ${todoContent}${attributes.length > 0 ? ' ' + attributes.join(' ') : ''}`;
        lines[todo.lineNumber - 1] = newLine;

        await fs.promises.writeFile(todo.filePath, lines.join('\n'), 'utf-8');
        return true;
    } catch (error) {
        console.error(`Error updating todo attributes:`, error);
        return false;
    }
}
