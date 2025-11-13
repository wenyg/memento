/**
 * 标签树提供者
 */

import * as vscode from 'vscode';
import { MdFileInfo, TagInfo } from '../types';
import { getNotesRootPath, loadMementoConfig } from '../config';
import { findMarkdownFilesWithTags } from '../utils';
import { TagItem } from './base';

export class TagTreeProvider implements vscode.TreeDataProvider<TagItem> {
    private _onDidChangeTreeData: vscode.EventEmitter<TagItem | undefined | null | void> = new vscode.EventEmitter<TagItem | undefined | null | void>();
    readonly onDidChangeTreeData: vscode.Event<TagItem | undefined | null | void> = this._onDidChangeTreeData.event;

    private tagTree: TagInfo[] = [];
    private mdFiles: MdFileInfo[] = [];
    private pinnedTags: Set<string> = new Set();

    constructor() {
        this.refresh();
    }

    refresh(): void {
        console.log('TagTreeProvider: Refreshing tree data');
        this._loadConfig().then(() => {
            return this._loadMarkdownFiles();
        }).then(() => {
            this.buildTagTree();
            this._onDidChangeTreeData.fire();
        });
    }

    getTreeItem(element: TagItem): vscode.TreeItem {
        return element;
    }

    getChildren(element?: TagItem): Thenable<TagItem[]> {
        if (!element) {
            // 根级别 - 返回标签层次结构，置顶标签在前
            const items = this.tagTree.map(tagInfo => {
                const hasChildren = (tagInfo.children && tagInfo.children.length > 0) || tagInfo.files.length > 0;
                const fullTagPath = this.getFullTagPath(tagInfo);
                const isPinned = this.pinnedTags.has(fullTagPath);
                return new TagItem(
                    tagInfo,
                    hasChildren ? vscode.TreeItemCollapsibleState.Collapsed : vscode.TreeItemCollapsibleState.None,
                    false,
                    undefined,
                    isPinned,
                    fullTagPath
                );
            });
            
            // 排序：置顶标签在前，然后按字母顺序
            items.sort((a, b) => {
                if (a.isPinned !== b.isPinned) {
                    return a.isPinned ? -1 : 1;
                }
                return a.tagInfo.tag.localeCompare(b.tagInfo.tag);
            });
            
            return Promise.resolve(items);
        } else if (!element.isFile) {
            // 标签级别 - 返回子标签和文件
            const items: TagItem[] = [];

            // 首先添加子标签
            if (element.tagInfo.children) {
                const childItems = element.tagInfo.children.map(childTagInfo => {
                    const hasChildren = (childTagInfo.children && childTagInfo.children.length > 0) || childTagInfo.files.length > 0;
                    const fullTagPath = this.getFullTagPath(childTagInfo, element.tagInfo.tag);
                    const isPinned = this.pinnedTags.has(fullTagPath);
                    return new TagItem(
                        childTagInfo,
                        hasChildren ? vscode.TreeItemCollapsibleState.Collapsed : vscode.TreeItemCollapsibleState.None,
                        false,
                        undefined,
                        isPinned,
                        fullTagPath
                    );
                });
                
                // 排序：置顶标签在前
                childItems.sort((a, b) => {
                    if (a.isPinned !== b.isPinned) {
                        return a.isPinned ? -1 : 1;
                    }
                    return a.tagInfo.tag.localeCompare(b.tagInfo.tag);
                });
                
                items.push(...childItems);
            }

            // 添加文件
            items.push(...element.tagInfo.files.map(fileInfo =>
                new TagItem(
                    element.tagInfo,
                    vscode.TreeItemCollapsibleState.None,
                    true,
                    fileInfo
                )
            ));

            return Promise.resolve(items);
        }

        return Promise.resolve([]);
    }
    
    private getFullTagPath(tagInfo: TagInfo, parentPath: string = ''): string {
        const currentPath = parentPath ? `${parentPath}/${tagInfo.tag}` : tagInfo.tag;
        return currentPath;
    }
    
    private async _loadConfig(): Promise<void> {
        try {
            const rootPath = await getNotesRootPath();
            if (!rootPath) {
                this.pinnedTags = new Set();
                return;
            }
            const config = await loadMementoConfig(rootPath);
            this.pinnedTags = new Set(config.pinnedTags);
        } catch (error) {
            console.error('TagTreeProvider: Error loading config:', error);
            this.pinnedTags = new Set();
        }
    }

    private async _loadMarkdownFiles(): Promise<void> {
        try {
            const rootPath = await getNotesRootPath();
            if (!rootPath) {
                console.log('TagTreeProvider: No notes path available');
                this.mdFiles = [];
                return;
            }

            console.log('TagTreeProvider: Searching in:', rootPath);
            const mdFiles = await findMarkdownFilesWithTags(rootPath);
            console.log('TagTreeProvider: Found files:', mdFiles.length);

            this.mdFiles = mdFiles;
            console.log('TagTreeProvider: Files loaded');
        } catch (error) {
            console.error('TagTreeProvider: Error loading files:', error);
            this.mdFiles = [];
        }
    }

    private buildTagTree(): void {
        const tagMap = new Map<string, TagInfo>();
        const rootTags = new Set<string>();

        // 处理所有文件及其标签
        for (const file of this.mdFiles) {
            if (!file.tags || file.tags.length === 0) {
                continue;
            }

            for (const tag of file.tags) {
                this.addTagToTree(tag, file, tagMap, rootTags);
            }
        }

        // 将映射转换为树结构 - 只获取根级别标签
        this.tagTree = Array.from(rootTags).map(rootTag => tagMap.get(rootTag)!);

        // 按字母顺序排序标签
        this.sortTagTree(this.tagTree);
    }

    private addTagToTree(tag: string, file: MdFileInfo, tagMap: Map<string, TagInfo>, rootTags: Set<string>): void {
        const parts = tag.split('/');
        let currentPath = '';

        for (let i = 0; i < parts.length; i++) {
            const part = parts[i];
            const parentPath = currentPath;
            currentPath = currentPath ? `${currentPath}/${part}` : part;

            // 跟踪根级别标签
            if (i === 0) {
                rootTags.add(currentPath);
            }

            if (!tagMap.has(currentPath)) {
                tagMap.set(currentPath, {
                    tag: part,
                    files: [],
                    children: []
                });
            }

            const tagInfo = tagMap.get(currentPath)!;

            // 将文件添加到最深层级的标签
            if (i === parts.length - 1) {
                if (!tagInfo.files.some(f => f.path === file.path)) {
                    tagInfo.files.push(file);
                }
            }

            // 链接父子关系
            if (parentPath) {
                const parentTagInfo = tagMap.get(parentPath)!;
                const childTagInfo = tagMap.get(currentPath)!;
                if (!parentTagInfo.children!.some(child => child === childTagInfo)) {
                    parentTagInfo.children!.push(childTagInfo);
                }
            }
        }
    }

    private sortTagTree(tagTree: TagInfo[]): void {
        tagTree.sort((a, b) => a.tag.localeCompare(b.tag));
        for (const tagInfo of tagTree) {
            if (tagInfo.children) {
                this.sortTagTree(tagInfo.children);
            }
            tagInfo.files.sort((a, b) => a.relativePath.localeCompare(b.relativePath));
        }
    }
}
