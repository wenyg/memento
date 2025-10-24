/**
 * Memento 工具函数模块
 */

import * as fs from 'fs';
import * as path from 'path';
import { MdFileInfo, FrontMatter } from './types';
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
