import * as vscode from 'vscode';
import { TodoItem } from '../types';

export type TodoFilterType = 'all' | 'pending' | 'completed' | 'thisWeekCompleted' | 'lastWeekCompleted' | 'thisMonthCompleted' | 'overdue' | 'dueToday' | 'dueThisWeek' | 'byTag';

/**
 * TODO 控制项
 */
export class TodoControlItem extends vscode.TreeItem {
    constructor(
        public readonly label: string,
        public readonly collapsibleState: vscode.TreeItemCollapsibleState,
        public readonly type: 'category' | 'filter' | 'report' | 'tag',
        public readonly filterType?: TodoFilterType,
        public readonly isActive: boolean = false,
        public readonly count?: number,
        public readonly tagName?: string
    ) {
        super(label, collapsibleState);
        
        if (type === 'filter' || type === 'report' || type === 'tag') {
            this.contextValue = type === 'filter' ? 'todoFilter' : (type === 'tag' ? 'todoTag' : 'todoReport');
            
            if (type === 'filter') {
                // 使用复选框图标表示激活状态
                if (isActive) {
                    this.iconPath = new vscode.ThemeIcon('check', new vscode.ThemeColor('charts.green'));
                } else {
                    this.iconPath = new vscode.ThemeIcon('circle-outline');
                }
            } else if (type === 'tag') {
                // 标签项使用标签图标
                if (isActive) {
                    this.iconPath = new vscode.ThemeIcon('tag', new vscode.ThemeColor('charts.yellow'));
                } else {
                    this.iconPath = new vscode.ThemeIcon('tag');
                }
            } else {
                // 报告项使用不同的图标
                if (isActive) {
                    this.iconPath = new vscode.ThemeIcon('graph', new vscode.ThemeColor('charts.blue'));
                } else {
                    this.iconPath = new vscode.ThemeIcon('graph-line');
                }
            }
            
            // 设置命令
            this.command = {
                command: 'memento.setTodoFilter',
                title: 'Set TODO Filter',
                arguments: [filterType, tagName]
            };
        } else {
            this.contextValue = 'todoCategory';
            if (label === '过滤器') {
                this.iconPath = new vscode.ThemeIcon('filter');
            } else if (label === '按标签过滤') {
                this.iconPath = new vscode.ThemeIcon('tag');
            } else {
                this.iconPath = new vscode.ThemeIcon('graph');
            }
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
    private currentTag: string | null = null;
    private todos: TodoItem[] = [];
    
    constructor() {}
    
    refresh(): void {
        this._onDidChangeTreeData.fire();
    }
    
    getCurrentFilter(): TodoFilterType {
        return this.currentFilter;
    }
    
    getCurrentTag(): string | null {
        return this.currentTag;
    }
    
    setFilter(filterType: TodoFilterType, tagName?: string): void {
        this.currentFilter = filterType;
        if (filterType === 'byTag' && tagName) {
            this.currentTag = tagName;
        } else {
            this.currentTag = null;
        }
        this.refresh();
    }
    
    updateTodos(todos: TodoItem[]): void {
        this.todos = todos;
        this.refresh();
    }
    
    getTreeItem(element: TodoControlItem): vscode.TreeItem {
        return element;
    }
    
    async getChildren(element?: TodoControlItem): Promise<TodoControlItem[]> {
        if (!element) {
            // 根级别 - 显示过滤分类、标签过滤和统计报告
            return [
                new TodoControlItem(
                    '过滤器',
                    vscode.TreeItemCollapsibleState.Expanded,
                    'category'
                ),
                new TodoControlItem(
                    '按标签过滤',
                    vscode.TreeItemCollapsibleState.Collapsed,
                    'category'
                ),
                new TodoControlItem(
                    '统计报告',
                    vscode.TreeItemCollapsibleState.Expanded,
                    'category'
                )
            ];
        }
        
        if (element.label === '过滤器') {
            // 过滤器子项
            const pendingCount = this.todos.filter(t => !t.completed).length;
            const allCount = this.todos.length;
            const completedCount = this.todos.filter(t => t.completed).length;
            
            return [
                new TodoControlItem(
                    `仅未完成 (${pendingCount})`,
                    vscode.TreeItemCollapsibleState.None,
                    'filter',
                    'pending',
                    this.currentFilter === 'pending' && !this.currentTag
                ),
                new TodoControlItem(
                    `全部 (${allCount})`,
                    vscode.TreeItemCollapsibleState.None,
                    'filter',
                    'all',
                    this.currentFilter === 'all' && !this.currentTag
                ),
                new TodoControlItem(
                    `仅已完成 (${completedCount})`,
                    vscode.TreeItemCollapsibleState.None,
                    'filter',
                    'completed',
                    this.currentFilter === 'completed' && !this.currentTag
                )
            ];
        }
        
        if (element.label === '按标签过滤') {
            // 提取所有标签并统计
            const tagCounts = new Map<string, number>();
            
            for (const todo of this.todos) {
                if (todo.tags && todo.tags.length > 0) {
                    for (const tag of todo.tags) {
                        tagCounts.set(tag, (tagCounts.get(tag) || 0) + 1);
                    }
                }
            }
            
            // 按标签名称排序
            const sortedTags = Array.from(tagCounts.entries()).sort((a, b) => {
                // 先按数量降序，再按名称升序
                if (b[1] !== a[1]) {
                    return b[1] - a[1];
                }
                return a[0].localeCompare(b[0]);
            });
            
            if (sortedTags.length === 0) {
                return [
                    new TodoControlItem(
                        '(暂无标签)',
                        vscode.TreeItemCollapsibleState.None,
                        'tag',
                        undefined,
                        false,
                        0
                    )
                ];
            }
            
            return sortedTags.map(([tag, count]) => 
                new TodoControlItem(
                    `#${tag} (${count})`,
                    vscode.TreeItemCollapsibleState.None,
                    'tag',
                    'byTag',
                    this.currentFilter === 'byTag' && this.currentTag === tag,
                    count,
                    tag
                )
            );
        }
        
        if (element.label === '统计报告') {
            // 统计报告子项
            const stats = this.calculateStats();
            
            return [
                new TodoControlItem(
                    `本周完成 (${stats.thisWeekCompleted})`,
                    vscode.TreeItemCollapsibleState.None,
                    'report',
                    'thisWeekCompleted',
                    this.currentFilter === 'thisWeekCompleted',
                    stats.thisWeekCompleted
                ),
                new TodoControlItem(
                    `上周完成 (${stats.lastWeekCompleted})`,
                    vscode.TreeItemCollapsibleState.None,
                    'report',
                    'lastWeekCompleted',
                    this.currentFilter === 'lastWeekCompleted',
                    stats.lastWeekCompleted
                ),
                new TodoControlItem(
                    `本月完成 (${stats.thisMonthCompleted})`,
                    vscode.TreeItemCollapsibleState.None,
                    'report',
                    'thisMonthCompleted',
                    this.currentFilter === 'thisMonthCompleted',
                    stats.thisMonthCompleted
                ),
                new TodoControlItem(
                    `已逾期 (${stats.overdue})`,
                    vscode.TreeItemCollapsibleState.None,
                    'report',
                    'overdue',
                    this.currentFilter === 'overdue',
                    stats.overdue
                ),
                new TodoControlItem(
                    `今日到期 (${stats.dueToday})`,
                    vscode.TreeItemCollapsibleState.None,
                    'report',
                    'dueToday',
                    this.currentFilter === 'dueToday',
                    stats.dueToday
                ),
                new TodoControlItem(
                    `本周到期 (${stats.dueThisWeek})`,
                    vscode.TreeItemCollapsibleState.None,
                    'report',
                    'dueThisWeek',
                    this.currentFilter === 'dueThisWeek',
                    stats.dueThisWeek
                )
            ];
        }
        
        return [];
    }
    
    /**
     * 计算统计数据
     */
    private calculateStats() {
        const now = new Date();
        const today = this.getDateString(now);
        
        // 获取本周、上周、本月的日期范围
        const thisWeekStart = this.getWeekStart(now);
        const thisWeekEnd = new Date(thisWeekStart);
        thisWeekEnd.setDate(thisWeekEnd.getDate() + 6);

        const lastWeekStart = new Date(thisWeekStart);
        lastWeekStart.setDate(lastWeekStart.getDate() - 7);
        const lastWeekEnd = new Date(thisWeekStart);
        lastWeekEnd.setDate(lastWeekEnd.getDate() - 1);
        
        const thisMonthStart = new Date(now.getFullYear(), now.getMonth(), 1);
        
        return {
            thisWeekCompleted: this.todos.filter(t => 
                t.completed && t.endTime && 
                t.endTime >= this.getDateString(thisWeekStart) && 
                t.endTime <= this.getDateString(thisWeekEnd)
            ).length,
            
            lastWeekCompleted: this.todos.filter(t => 
                t.completed && t.endTime && 
                t.endTime >= this.getDateString(lastWeekStart) && 
                t.endTime <= this.getDateString(lastWeekEnd)
            ).length,
            
            thisMonthCompleted: this.todos.filter(t => 
                t.completed && t.endTime && 
                t.endTime >= this.getDateString(thisMonthStart)
            ).length,
            
            overdue: this.todos.filter(t => 
                !t.completed && t.due && t.due < today
            ).length,
            
            dueToday: this.todos.filter(t => 
                !t.completed && t.due === today
            ).length,
            
            dueThisWeek: this.todos.filter(t => 
                !t.completed && t.due && 
                t.due >= this.getDateString(thisWeekStart) && 
                t.due <= this.getDateString(thisWeekEnd)
            ).length
        };
    }
    
    /**
     * 获取一周的开始日期（周一）
     */
    private getWeekStart(date: Date): Date {
        const d = new Date(date);
        const day = d.getDay();
        const diff = d.getDate() - day + (day === 0 ? -6 : 1); // 调整为周一
        return new Date(d.setDate(diff));
    }
    
    /**
     * 将日期转换为 YYYY-MM-DD 格式
     */
    private getDateString(date: Date): string {
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const day = String(date.getDate()).padStart(2, '0');
        return `${year}-${month}-${day}`;
    }
}
