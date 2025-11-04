/**
 * Markdown 文件提供者
 */

import * as vscode from 'vscode';
import { MdFileInfo } from '../types';
import { getNotesRootPath, loadMementoConfig } from '../config';
import { findMarkdownFiles } from '../utils';
import { MdFileItem } from './base';
import * as path from 'path';

export class MdFilesProvider implements vscode.TreeDataProvider<MdFileItem> {
    private _onDidChangeTreeData: vscode.EventEmitter<MdFileItem | undefined | null | void> = new vscode.EventEmitter<MdFileItem | undefined | null | void>();
    readonly onDidChangeTreeData: vscode.Event<MdFileItem | undefined | null | void> = this._onDidChangeTreeData.event;

    private mdFiles: MdFileInfo[] = [];
    private pinnedFiles: Set<string> = new Set();

    constructor() {
        this.refresh();
    }

    refresh(): void {
        console.log('MdFilesProvider: Refreshing tree data');
        this._loadMarkdownFiles().then(() => {
            this._onDidChangeTreeData.fire();
        });
    }

    getTreeItem(element: MdFileItem): vscode.TreeItem {
        return element;
    }

    getChildren(element?: MdFileItem): Thenable<MdFileItem[]> {
        if (!element) {
            // 根级别 - 首先显示"新建笔记"操作，然后是所有 markdown 文件
            const createNoteItem = new MdFileItem(
                null,
                vscode.TreeItemCollapsibleState.None,
                true,
                false
            );
            
            const fileItems = this.mdFiles.map(fileInfo => {
                const isPinned = this.pinnedFiles.has(fileInfo.path);
                return new MdFileItem(fileInfo, vscode.TreeItemCollapsibleState.None, false, isPinned);
            });
            
            return Promise.resolve([createNoteItem, ...fileItems]);
        }
        return Promise.resolve([]);
    }

    private async _loadMarkdownFiles(): Promise<void> {
        try {
            const rootPath = await getNotesRootPath();
            if (!rootPath) {
                console.log('MdFilesProvider: No notes path available');
                this.mdFiles = [];
                return;
            }

            // 加载配置以获取置顶文件列表
            const config = await loadMementoConfig(rootPath);
            this.pinnedFiles = new Set(config.pinnedFiles);

            console.log('MdFilesProvider: Searching in:', rootPath);
            const mdFiles = await findMarkdownFiles(rootPath);
            console.log('MdFilesProvider: Found files:', mdFiles.length);

            // 按创建时间排序（最新的在前）
            const sortedFiles = mdFiles.sort((a, b) => b.birthtime.getTime() - a.birthtime.getTime());

            // 分离置顶文件和非置顶文件
            const pinnedFilesList: MdFileInfo[] = [];
            const unpinnedFilesList: MdFileInfo[] = [];

            for (const file of sortedFiles) {
                if (this.pinnedFiles.has(file.path)) {
                    pinnedFilesList.push(file);
                } else {
                    unpinnedFilesList.push(file);
                }
            }

            // 置顶文件在前，非置顶文件在后
            this.mdFiles = [...pinnedFilesList, ...unpinnedFilesList];
            console.log('MdFilesProvider: Files loaded and sorted (pinned:', pinnedFilesList.length, ', unpinned:', unpinnedFilesList.length, ')');
        } catch (error) {
            console.error('MdFilesProvider: Error loading files:', error);
            this.mdFiles = [];
        }
    }
}
