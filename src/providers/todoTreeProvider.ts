/**
 * TODO 树提供者 - 管理 TODO 列表视图
 */

import * as vscode from 'vscode';
import { TodoItem, TodoPriority } from '../types';
import { extractTodosFromDirectory } from '../utils';
import { getNotesRootPath } from '../config';

/**
 * TODO TreeItem 类
 */
export class TodoTreeItem extends vscode.TreeItem {
    constructor(
        public readonly label: string,
        public readonly collapsibleState: vscode.TreeItemCollapsibleState,
        public readonly todoItem?: TodoItem,
        public readonly isGroup: boolean = false
    ) {
        super(label, collapsibleState);

        if (todoItem) {
            // 构建描述信息
            const descriptions: string[] = [];
            
            if (todoItem.priority !== TodoPriority.NONE) {
                descriptions.push(`[${todoItem.priority}]`);
            }
            
            if (todoItem.due) {
                descriptions.push(`📅 ${todoItem.due}`);
            }
            
            if (todoItem.project) {
                descriptions.push(`📁 ${todoItem.project}`);
            }

            this.description = descriptions.join(' ');

            // 构建 tooltip
            const tooltipLines: string[] = [
                todoItem.content,
                `文件: ${todoItem.fileName}`,
                `行号: ${todoItem.lineNumber}`,
                `状态: ${todoItem.completed ? '已完成' : '未完成'}`
            ];

            if (todoItem.priority !== TodoPriority.NONE) {
                tooltipLines.push(`优先级: ${todoItem.priority}`);
            }

            if (todoItem.due) {
                tooltipLines.push(`截止日期: ${todoItem.due}`);
            }

            if (todoItem.project) {
                tooltipLines.push(`项目: ${todoItem.project}`);
            }

            if (todoItem.tags.length > 0) {
                tooltipLines.push(`标签: ${todoItem.tags.map(t => '#' + t).join(', ')}`);
            }

            this.tooltip = tooltipLines.join('\n');

            // 设置图标
            if (todoItem.completed) {
                this.iconPath = new vscode.ThemeIcon('check', new vscode.ThemeColor('charts.green'));
            } else {
                switch (todoItem.priority) {
                    case TodoPriority.HIGH:
                        this.iconPath = new vscode.ThemeIcon('alert', new vscode.ThemeColor('charts.red'));
                        break;
                    case TodoPriority.MEDIUM:
                        this.iconPath = new vscode.ThemeIcon('circle-outline', new vscode.ThemeColor('charts.yellow'));
                        break;
                    default:
                        this.iconPath = new vscode.ThemeIcon('circle-outline', new vscode.ThemeColor('charts.blue'));
                        break;
                }
            }

            // 设置命令 - 跳转到文件的指定行
            this.resourceUri = vscode.Uri.file(todoItem.filePath);
            this.command = {
                command: 'memento.openTodoInFile',
                title: 'Open TODO in File',
                arguments: [todoItem]
            };

            this.contextValue = todoItem.completed ? 'todoItemCompleted' : 'todoItemPending';
        } else if (isGroup) {
            // 分组项
            this.iconPath = new vscode.ThemeIcon('folder');
            this.contextValue = 'todoGroup';
        }
    }
}

/**
 * TODO 树数据提供者
 */
export class TodoTreeProvider implements vscode.TreeDataProvider<TodoTreeItem> {
    private _onDidChangeTreeData: vscode.EventEmitter<TodoTreeItem | undefined | null | void> = new vscode.EventEmitter<TodoTreeItem | undefined | null | void>();
    readonly onDidChangeTreeData: vscode.Event<TodoTreeItem | undefined | null | void> = this._onDidChangeTreeData.event;

    private todos: TodoItem[] = [];
    private groupBy: 'file' | 'project' | 'priority' | 'status' = 'file';

    constructor() {
        this.refresh();
    }

    refresh(): void {
        this._onDidChangeTreeData.fire();
    }

    setGroupBy(groupBy: 'file' | 'project' | 'priority' | 'status'): void {
        this.groupBy = groupBy;
        this.refresh();
    }

    getTreeItem(element: TodoTreeItem): vscode.TreeItem {
        return element;
    }

    async getChildren(element?: TodoTreeItem): Promise<TodoTreeItem[]> {
        if (!element) {
            // 根级别 - 加载所有 TODO
            const notesPath = await getNotesRootPath();
            if (!notesPath) {
                return [];
            }

            this.todos = await extractTodosFromDirectory(notesPath);

            // 根据分组方式返回不同的结果
            switch (this.groupBy) {
                case 'file':
                    return this.groupByFile();
                case 'project':
                    return this.groupByProject();
                case 'priority':
                    return this.groupByPriority();
                case 'status':
                    return this.groupByStatus();
                default:
                    return this.groupByFile();
            }
        } else if (element.isGroup) {
            // 返回该组下的 TODO 项
            const groupLabel = element.label as string;
            let filteredTodos: TodoItem[] = [];

            switch (this.groupBy) {
                case 'file':
                    filteredTodos = this.todos.filter(t => t.fileName === groupLabel);
                    break;
                case 'project':
                    if (groupLabel === '未分类') {
                        filteredTodos = this.todos.filter(t => !t.project);
                    } else {
                        filteredTodos = this.todos.filter(t => t.project === groupLabel);
                    }
                    break;
                case 'priority':
                    if (groupLabel === '高优先级') {
                        filteredTodos = this.todos.filter(t => t.priority === TodoPriority.HIGH);
                    } else if (groupLabel === '中优先级') {
                        filteredTodos = this.todos.filter(t => t.priority === TodoPriority.MEDIUM);
                    } else if (groupLabel === '低优先级') {
                        filteredTodos = this.todos.filter(t => t.priority === TodoPriority.LOW);
                    } else {
                        filteredTodos = this.todos.filter(t => t.priority === TodoPriority.NONE);
                    }
                    break;
                case 'status':
                    if (groupLabel === '未完成') {
                        filteredTodos = this.todos.filter(t => !t.completed);
                    } else {
                        filteredTodos = this.todos.filter(t => t.completed);
                    }
                    break;
            }

            // 返回 TODO 项，支持嵌套层级
            return this.buildTodoTree(filteredTodos);
        }

        return [];
    }

    /**
     * 按文件分组
     */
    private groupByFile(): TodoTreeItem[] {
        const fileMap = new Map<string, TodoItem[]>();

        for (const todo of this.todos) {
            if (!fileMap.has(todo.fileName)) {
                fileMap.set(todo.fileName, []);
            }
            fileMap.get(todo.fileName)!.push(todo);
        }

        const groups: TodoTreeItem[] = [];
        for (const [fileName, todos] of fileMap.entries()) {
            const completedCount = todos.filter(t => t.completed).length;
            const label = `${fileName} (${completedCount}/${todos.length})`;
            groups.push(new TodoTreeItem(
                label,
                vscode.TreeItemCollapsibleState.Collapsed,
                undefined,
                true
            ));
        }

        return groups.sort((a, b) => (a.label as string).localeCompare(b.label as string));
    }

    /**
     * 按项目分组
     */
    private groupByProject(): TodoTreeItem[] {
        const projectMap = new Map<string, TodoItem[]>();

        for (const todo of this.todos) {
            const project = todo.project || '未分类';
            if (!projectMap.has(project)) {
                projectMap.set(project, []);
            }
            projectMap.get(project)!.push(todo);
        }

        const groups: TodoTreeItem[] = [];
        for (const [project, todos] of projectMap.entries()) {
            const completedCount = todos.filter(t => t.completed).length;
            const label = `${project} (${completedCount}/${todos.length})`;
            groups.push(new TodoTreeItem(
                project === '未分类' ? label : label,
                vscode.TreeItemCollapsibleState.Collapsed,
                undefined,
                true
            ));
        }

        return groups.sort((a, b) => (a.label as string).localeCompare(b.label as string));
    }

    /**
     * 按优先级分组
     */
    private groupByPriority(): TodoTreeItem[] {
        const priorityGroups = [
            { label: '高优先级', priority: TodoPriority.HIGH, icon: '🔴' },
            { label: '中优先级', priority: TodoPriority.MEDIUM, icon: '🟡' },
            { label: '低优先级', priority: TodoPriority.LOW, icon: '🔵' },
            { label: '无优先级', priority: TodoPriority.NONE, icon: '⚪' }
        ];

        const groups: TodoTreeItem[] = [];

        for (const group of priorityGroups) {
            const todos = this.todos.filter(t => t.priority === group.priority);
            if (todos.length > 0) {
                const completedCount = todos.filter(t => t.completed).length;
                groups.push(new TodoTreeItem(
                    `${group.label} (${completedCount}/${todos.length})`,
                    vscode.TreeItemCollapsibleState.Collapsed,
                    undefined,
                    true
                ));
            }
        }

        return groups;
    }

    /**
     * 按状态分组
     */
    private groupByStatus(): TodoTreeItem[] {
        const pending = this.todos.filter(t => !t.completed);
        const completed = this.todos.filter(t => t.completed);

        const groups: TodoTreeItem[] = [];

        if (pending.length > 0) {
            groups.push(new TodoTreeItem(
                `未完成 (${pending.length})`,
                vscode.TreeItemCollapsibleState.Expanded,
                undefined,
                true
            ));
        }

        if (completed.length > 0) {
            groups.push(new TodoTreeItem(
                `已完成 (${completed.length})`,
                vscode.TreeItemCollapsibleState.Collapsed,
                undefined,
                true
            ));
        }

        return groups;
    }

    /**
     * 构建 TODO 树（支持嵌套层级）
     */
    private buildTodoTree(todos: TodoItem[]): TodoTreeItem[] {
        const result: TodoTreeItem[] = [];
        const todoMap = new Map<number, TodoTreeItem>();

        // 按行号排序
        todos.sort((a, b) => a.lineNumber - b.lineNumber);

        for (const todo of todos) {
            const item = new TodoTreeItem(
                todo.content,
                vscode.TreeItemCollapsibleState.None,
                todo,
                false
            );
            todoMap.set(todo.lineNumber, item);
        }

        // 构建树形结构（基于 level）
        const levelStack: { level: number; item: TodoTreeItem }[] = [];

        for (const todo of todos) {
            const item = todoMap.get(todo.lineNumber)!;

            // 找到父级
            while (levelStack.length > 0 && levelStack[levelStack.length - 1].level >= todo.level) {
                levelStack.pop();
            }

            if (levelStack.length === 0) {
                // 顶级项
                result.push(item);
            }

            levelStack.push({ level: todo.level, item });
        }

        return result;
    }
}

