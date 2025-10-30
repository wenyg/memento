/**
 * TODO 控制面板 TreeProvider
 * 提供过滤和视图控制选项
 */

import * as vscode from 'vscode';

export type TodoFilterType = 'all' | 'pending' | 'completed';

/**
 * TODO 控制项
 */
export class TodoControlItem extends vscode.TreeItem {
    constructor(
        public readonly label: string,
        public readonly collapsibleState: vscode.TreeItemCollapsibleState,
        public readonly type: 'category' | 'filter',
        public readonly filterType?: TodoFilterType,
        public readonly isActive: boolean = false
    ) {
        super(label, collapsibleState);
        
        if (type === 'filter') {
            this.contextValue = 'todoFilter';
            // 使用复选框图标表示激活状态
            if (isActive) {
                this.iconPath = new vscode.ThemeIcon('check', new vscode.ThemeColor('charts.green'));
            } else {
                this.iconPath = new vscode.ThemeIcon('circle-outline');
            }
        } else {
            this.contextValue = 'todoCategory';
            this.iconPath = new vscode.ThemeIcon('filter');
        }
        
        // 设置命令
        if (type === 'filter') {
            this.command = {
                command: 'memento.setTodoFilter',
                title: 'Set TODO Filter',
                arguments: [filterType]
            };
        }
    }
}

/**
 * TODO 控制树数据提供者
 */
export class TodoControlProvider implements vscode.TreeDataProvider<TodoControlItem> {
    private _onDidChangeTreeData: vscode.EventEmitter<TodoControlItem | undefined | null | void> = new vscode.EventEmitter<TodoControlItem | undefined | null | void>();
    readonly onDidChangeTreeData: vscode.Event<TodoControlItem | undefined | null | void> = this._onDidChangeTreeData.event;
    
    private currentFilter: TodoFilterType = 'pending';
    
    constructor() {}
    
    refresh(): void {
        this._onDidChangeTreeData.fire();
    }
    
    getCurrentFilter(): TodoFilterType {
        return this.currentFilter;
    }
    
    setFilter(filterType: TodoFilterType): void {
        this.currentFilter = filterType;
        this.refresh();
    }
    
    getTreeItem(element: TodoControlItem): vscode.TreeItem {
        return element;
    }
    
    async getChildren(element?: TodoControlItem): Promise<TodoControlItem[]> {
        if (!element) {
            // 根级别 - 显示过滤分类
            return [
                new TodoControlItem(
                    '过滤器',
                    vscode.TreeItemCollapsibleState.Expanded,
                    'category'
                )
            ];
        }
        
        if (element.label === '过滤器') {
            // 过滤器子项
            return [
                new TodoControlItem(
                    '仅未完成',
                    vscode.TreeItemCollapsibleState.None,
                    'filter',
                    'pending',
                    this.currentFilter === 'pending'
                ),
                new TodoControlItem(
                    '全部',
                    vscode.TreeItemCollapsibleState.None,
                    'filter',
                    'all',
                    this.currentFilter === 'all'
                ),
                new TodoControlItem(
                    '仅已完成',
                    vscode.TreeItemCollapsibleState.None,
                    'filter',
                    'completed',
                    this.currentFilter === 'completed'
                )
            ];
        }
        
        return [];
    }
}

