/**
 * Markdown 文件提供者
 */

import * as vscode from 'vscode';
import { MdFileInfo } from '../types';
import { getNotesRootPath } from '../config';
import { findMarkdownFiles } from '../utils';
import { MdFileItem } from './base';

export class MdFilesProvider implements vscode.TreeDataProvider<MdFileItem> {
    private _onDidChangeTreeData: vscode.EventEmitter<MdFileItem | undefined | null | void> = new vscode.EventEmitter<MdFileItem | undefined | null | void>();
    readonly onDidChangeTreeData: vscode.Event<MdFileItem | undefined | null | void> = this._onDidChangeTreeData.event;

    private mdFiles: MdFileInfo[] = [];

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
            // 根级别 - 返回所有 markdown 文件
            return Promise.resolve(
                this.mdFiles.map(fileInfo =>
                    new MdFileItem(fileInfo, vscode.TreeItemCollapsibleState.None)
                )
            );
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

            console.log('MdFilesProvider: Searching in:', rootPath);
            const mdFiles = await findMarkdownFiles(rootPath);
            console.log('MdFilesProvider: Found files:', mdFiles.length);

            // 按创建时间排序（最新的在前）
            this.mdFiles = mdFiles.sort((a, b) => b.birthtime.getTime() - a.birthtime.getTime());
            console.log('MdFilesProvider: Files loaded and sorted');
        } catch (error) {
            console.error('MdFilesProvider: Error loading files:', error);
            this.mdFiles = [];
        }
    }
}
