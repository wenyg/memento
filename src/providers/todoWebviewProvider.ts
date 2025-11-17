/**
 * TODO WebView 提供者 - 使用表格展示 TODO 列表
 */

import * as vscode from 'vscode';
import { TodoItem } from '../types';
import { extractTodosFromDirectory, toggleTodoStatus, updateTodoAttributes } from '../utils';
import { getNotesRootPath } from '../config';
import { TodoFilterType } from './todoControlProvider';

export { TodoFilterType };

export class TodoWebviewProvider implements vscode.WebviewViewProvider {
    public static readonly viewType = 'mementoTodoView';

    private _view?: vscode.WebviewView;
    private todos: TodoItem[] = [];
    private currentFilter: TodoFilterType = 'pending';
    private currentTag: string | null = null;

    constructor(
        private readonly _extensionUri: vscode.Uri,
    ) { }

    public resolveWebviewView(
        webviewView: vscode.WebviewView,
        context: vscode.WebviewViewResolveContext,
        _token: vscode.CancellationToken,
    ) {
        this._view = webviewView;

        webviewView.webview.options = {
            enableScripts: true,
            localResourceRoots: [this._extensionUri]
        };

        webviewView.webview.html = this._getHtmlForWebview(webviewView.webview);

        // 监听来自 webview 的消息
        webviewView.webview.onDidReceiveMessage(async (data) => {
            switch (data.type) {
                case 'refresh':
                    await this.refresh();
                    break;
                case 'toggleTodo':
                    await this.handleToggleTodo(data.todo);
                    break;
                case 'openTodo':
                    await this.handleOpenTodo(data.todo);
                    break;
                case 'editTodo':
                    await this.handleEditTodo(data.todo, data.updates);
                    break;
                case 'filterChanged':
                    this.handleFilterChanged(data.filter);
                    break;
            }
        });

        // 初始加载数据
        this.refresh();
    }

    public async refresh() {
        const notesPath = await getNotesRootPath();
        if (!notesPath) {
            this.todos = [];
        } else {
            this.todos = await extractTodosFromDirectory(notesPath);
        }

        if (this._view) {
            this._view.webview.postMessage({
                type: 'updateTodos',
                todos: this.todos,
                filter: this.currentFilter,
                tag: this.currentTag
            });
        }
    }

    public setFilter(filterType: TodoFilterType, tagName?: string) {
        this.currentFilter = filterType;
        if (filterType === 'byTag' && tagName) {
            this.currentTag = tagName;
        } else {
            this.currentTag = null;
        }
        if (this._view) {
            this._view.webview.postMessage({
                type: 'setFilter',
                filter: filterType,
                tag: this.currentTag
            });
        }
    }

    private async handleToggleTodo(todo: TodoItem) {
        const success = await toggleTodoStatus(todo);
        if (success) {
            await this.refresh();
            vscode.window.showInformationMessage(`TODO 已${todo.completed ? '标记为未完成' : '标记为完成'}`);
        } else {
            vscode.window.showErrorMessage('切换 TODO 状态失败');
        }
    }

    private async handleOpenTodo(todo: TodoItem) {
        try {
            const document = await vscode.workspace.openTextDocument(todo.filePath);
            const editor = await vscode.window.showTextDocument(document);

            const line = todo.lineNumber - 1;
            const position = new vscode.Position(line, 0);
            editor.selection = new vscode.Selection(position, position);
            editor.revealRange(new vscode.Range(position, position), vscode.TextEditorRevealType.InCenter);
        } catch (error) {
            vscode.window.showErrorMessage(`无法打开文件: ${error}`);
        }
    }

    private async handleEditTodo(todo: TodoItem, updates?: any) {
        // 如果提供了 updates，直接更新（来自内联编辑）
        if (updates) {
            const success = await updateTodoAttributes(todo, updates);
            if (success) {
                await this.refresh();
            } else {
                vscode.window.showErrorMessage('更新 TODO 失败');
            }
            return;
        }

        // 否则显示快速选择菜单（保留旧的对话框方式）
        const action = await vscode.window.showQuickPick([
            { label: '$(tag) 编辑标签', value: 'tags' },
            { label: '$(calendar) 设置截止日期', value: 'due' }
        ], {
            placeHolder: `编辑: ${todo.content}`
        });

        if (!action) {
            return;
        }

        let dialogUpdates: any = {};

        switch (action.value) {
            case 'tags':
                const tagsInput = await vscode.window.showInputBox({
                    prompt: '输入标签（用空格分隔，无需 # 前缀）',
                    value: todo.tags.join(' '),
                    placeHolder: '例如: 工作 紧急'
                });
                if (tagsInput !== undefined) {
                    dialogUpdates.tags = tagsInput.trim() ? tagsInput.trim().split(/\s+/) : [];
                }
                break;

            case 'due':
                const dueInput = await vscode.window.showInputBox({
                    prompt: '输入截止日期（YYYY-MM-DD）',
                    value: todo.due || '',
                    placeHolder: '例如: 2025-12-31',
                    validateInput: (value) => {
                        if (!value) {
                            return null;
                        }
                        if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
                            return '日期格式必须为 YYYY-MM-DD';
                        }
                        return null;
                    }
                });
                if (dueInput !== undefined) {
                    dialogUpdates.due = dueInput.trim();
                }
                break;
        }

        if (Object.keys(dialogUpdates).length > 0) {
            const success = await updateTodoAttributes(todo, dialogUpdates);
            if (success) {
                await this.refresh();
                vscode.window.showInformationMessage('TODO 已更新');
            } else {
                vscode.window.showErrorMessage('更新 TODO 失败');
            }
        }
    }

    private handleFilterChanged(filter: any) {
        // 过滤逻辑可以在前端处理
        console.log('Filter changed:', filter);
    }

    private _getHtmlForWebview(webview: vscode.Webview) {
        const styleUri = webview.asWebviewUri(vscode.Uri.joinPath(this._extensionUri, 'media', 'todo.css'));
        const scriptUri = webview.asWebviewUri(vscode.Uri.joinPath(this._extensionUri, 'media', 'todo.js'));

        const nonce = getNonce();

        return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
    <meta charset="UTF-8">
    <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource} 'unsafe-inline'; script-src 'nonce-${nonce}';">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>TODO List</title>
    <style nonce="${nonce}">
        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }

        body {
            font-family: var(--vscode-font-family);
            font-size: var(--vscode-font-size);
            color: var(--vscode-foreground);
            background-color: var(--vscode-editor-background);
            padding: 10px;
        }

        .stats {
            padding: 8px;
            margin-bottom: 8px;
            background: var(--vscode-editor-inactiveSelectionBackground);
            border-radius: 4px;
            font-size: 12px;
        }

        .table-container {
            overflow-x: auto;
            border: 1px solid var(--vscode-panel-border);
            border-radius: 4px;
        }

        table {
            width: 100%;
            table-layout: fixed;
            border-collapse: collapse;
            background: var(--vscode-editor-background);
        }

        thead {
            background: var(--vscode-editor-inactiveSelectionBackground);
            position: sticky;
            top: 0;
            z-index: 10;
        }

        th {
            padding: 10px 8px;
            text-align: left;
            font-weight: 600;
            border-bottom: 2px solid var(--vscode-panel-border);
            cursor: pointer;
            user-select: none;
            white-space: nowrap;
            overflow: hidden;
            text-overflow: ellipsis;
        }

        th:hover {
            background: var(--vscode-list-hoverBackground);
        }

        th.sortable::after {
            content: ' ⇅';
            opacity: 0.3;
            font-size: 10px;
        }

        th.sorted-asc::after {
            content: ' ↑';
            opacity: 1;
            font-size: 10px;
        }

        th.sorted-desc::after {
            content: ' ↓';
            opacity: 1;
            font-size: 10px;
        }

        td {
            padding: 8px;
            border-bottom: 1px solid var(--vscode-panel-border);
            overflow: hidden;
            text-overflow: ellipsis;
            white-space: nowrap;
        }

        tr:hover {
            background: var(--vscode-list-hoverBackground);
        }

        tr.completed {
            opacity: 0.5;
            text-decoration: line-through;
        }

        tr.completed td {
            color: var(--vscode-disabledForeground);
        }

        .status-checkbox {
            cursor: pointer;
            width: 18px;
            height: 18px;
            margin: 0 auto;
            display: block;
        }

        .tags {
            display: flex;
            gap: 4px;
            flex-wrap: wrap;
            align-items: center;
        }

        .tag {
            background: var(--vscode-badge-background);
            color: var(--vscode-badge-foreground);
            padding: 2px 6px;
            border-radius: 3px;
            font-size: 10px;
            white-space: nowrap;
        }

        .content-cell {
            cursor: pointer;
            white-space: normal !important;
            word-wrap: break-word;
            overflow: visible !important;
            line-height: 1.4;
        }

        .content-cell:hover {
            text-decoration: underline;
            background: var(--vscode-list-activeSelectionBackground);
            color: var(--vscode-list-activeSelectionForeground);
        }

        .file-link {
            color: var(--vscode-textLink-foreground);
            cursor: pointer;
            text-decoration: none;
            font-size: 11px;
            opacity: 0.8;
        }

        .file-link:hover {
            text-decoration: underline;
            opacity: 1;
        }

        .editable-cell {
            position: relative;
            cursor: text;
        }

        .editable-cell:hover {
            background: var(--vscode-input-background);
            outline: 1px solid var(--vscode-focusBorder);
        }

        .editable-cell.editing {
            background: var(--vscode-input-background);
            outline: 2px solid var(--vscode-focusBorder);
        }

        .editable-cell input,
        .editable-cell select {
            width: 100%;
            background: transparent;
            color: var(--vscode-input-foreground);
            border: none;
            padding: 0;
            font-family: inherit;
            font-size: inherit;
            outline: none;
        }

        .tags-edit-input {
            min-width: 100px;
        }

        .due-date {
            white-space: nowrap;
            font-size: 11px;
            text-align: center;
        }

        .due-date.overdue {
            color: #f44336;
            font-weight: bold;
            background: rgba(244, 67, 54, 0.1);
            padding: 2px 4px;
            border-radius: 3px;
        }

        .due-date.today {
            color: #ff9800;
            font-weight: 600;
            background: rgba(255, 152, 0, 0.1);
            padding: 2px 4px;
            border-radius: 3px;
        }

        .due-date.upcoming {
            color: #4caf50;
            background: rgba(76, 175, 80, 0.1);
            padding: 2px 4px;
            border-radius: 3px;
        }

        .empty-state {
            text-align: center;
            padding: 40px;
            color: var(--vscode-descriptionForeground);
        }

        .indent-level-0 { padding-left: 8px; }
        .indent-level-1 { padding-left: 20px; }
        .indent-level-2 { padding-left: 32px; }
        .indent-level-3 { padding-left: 44px; }
        .indent-level-4 { padding-left: 56px; }

        .indent-level-1::before { content: '└ '; opacity: 0.3; }
        .indent-level-2::before { content: '└─ '; opacity: 0.3; }
        .indent-level-3::before { content: '└── '; opacity: 0.3; }
        .indent-level-4::before { content: '└─── '; opacity: 0.3; }
    </style>
</head>
<body>
    <div class="stats" id="stats"></div>

    <div class="table-container">
        <table id="todoTable">
            <thead>
                <tr>
                    <th style="width: 50px; text-align: center;">状态</th>
                    <th class="sortable" data-sort="content" style="width: 38%;">内容</th>
                    <th class="sortable" data-sort="tags" style="width: 16%;" title="双击编辑标签">标签</th>
                    <th class="sortable" data-sort="due" style="width: 60px; text-align: center;" title="双击编辑截止日期">截止</th>
                    <th class="sortable" data-sort="endTime" style="width: 60px; text-align: center;">完成</th>
                    <th class="sortable" data-sort="file" style="width: 18%;">文件</th>
                </tr>
            </thead>
            <tbody id="todoBody">
                <tr>
                    <td colspan="6" class="empty-state">
                        加载中...
                    </td>
                </tr>
            </tbody>
        </table>
    </div>

    <script nonce="${nonce}">
        const vscode = acquireVsCodeApi();
        let allTodos = [];
        let filteredTodos = [];
        let currentSort = { column: null, direction: 'asc' };
        let currentFilter = 'pending';
        let currentTag = null;

        // 接收来自扩展的消息
        window.addEventListener('message', event => {
            const message = event.data;
            switch (message.type) {
                case 'updateTodos':
                    allTodos = message.todos;
                    if (message.filter) {
                        currentFilter = message.filter;
                    }
                    if (message.tag !== undefined) {
                        currentTag = message.tag;
                    }
                    applyFilters();
                    break;
                case 'setFilter':
                    currentFilter = message.filter;
                    if (message.tag !== undefined) {
                        currentTag = message.tag;
                    }
                    applyFilters();
                    break;
            }
        });

        // 表头排序
        document.querySelectorAll('th.sortable').forEach(th => {
            th.addEventListener('click', () => {
                const column = th.dataset.sort;
                if (currentSort.column === column) {
                    currentSort.direction = currentSort.direction === 'asc' ? 'desc' : 'asc';
                } else {
                    currentSort.column = column;
                    currentSort.direction = 'asc';
                }
                updateSortIndicators();
                applyFilters();
            });
        });

        // 当前正在编辑的单元格
        let editingCell = null;
        let isSaving = false;

        // 使用事件委托处理表格点击事件
        document.getElementById('todoBody').addEventListener('click', (e) => {
            const target = e.target;
            
            // 如果正在编辑，点击其他地方保存
            if (editingCell && !target.closest('.editing')) {
                saveEdit();
            }
            
            // 处理内容单元格点击
            if (target.classList.contains('content-cell')) {
                const index = parseInt(target.getAttribute('data-todo-index') || '0');
                if (filteredTodos[index]) {
                    openTodo(filteredTodos[index]);
                }
                return;
            }
            
            // 处理文件链接点击
            if (target.classList.contains('file-link')) {
                const index = parseInt(target.getAttribute('data-todo-index') || '0');
                if (filteredTodos[index]) {
                    openTodo(filteredTodos[index]);
                }
                return;
            }
        });

        // 使用事件委托处理双击编辑
        document.getElementById('todoBody').addEventListener('dblclick', (e) => {
            const target = e.target.closest('.editable-cell');
            if (!target) return;
            
            // 如果已有正在编辑的单元格，先保存
            if (editingCell && editingCell !== target) {
                saveEdit();
            }
            
            startEdit(target);
        });

        // 使用事件委托处理复选框变化
        document.getElementById('todoBody').addEventListener('change', (e) => {
            const target = e.target;
            
            // 处理复选框变化
            if (target.classList.contains('status-checkbox')) {
                const index = parseInt(target.getAttribute('data-todo-index') || '0');
                if (filteredTodos[index]) {
                    toggleTodo(filteredTodos[index]);
                }
            }
        });

        function applyFilters() {
            const now = new Date();
            const today = getDateString(now);
            const thisWeekStart = getWeekStart(now);
            const thisWeekEnd = new Date(thisWeekStart);
            thisWeekEnd.setDate(thisWeekEnd.getDate() + 6);
            const lastWeekStart = new Date(thisWeekStart);
            lastWeekStart.setDate(lastWeekStart.getDate() - 7);
            const lastWeekEnd = new Date(thisWeekStart);
            lastWeekEnd.setDate(lastWeekEnd.getDate() - 1);
            const thisMonthStart = new Date(now.getFullYear(), now.getMonth(), 1);

            filteredTodos = allTodos.filter(todo => {
                // 标签过滤
                if (currentFilter === 'byTag' && currentTag) {
                    if (!todo.tags || !todo.tags.includes(currentTag)) {
                        return false;
                    }
                }
                
                // 状态过滤
                switch (currentFilter) {
                    case 'pending':
                        if (todo.completed) return false;
                        break;
                    case 'completed':
                        if (!todo.completed) return false;
                        break;
                    case 'thisWeekCompleted':
                        if (!todo.completed || !todo.endTime) return false;
                        if (todo.endTime < getDateString(thisWeekStart) || todo.endTime > getDateString(thisWeekEnd)) return false;
                        break;
                    case 'lastWeekCompleted':
                        if (!todo.completed || !todo.endTime) return false;
                        if (todo.endTime < getDateString(lastWeekStart) || todo.endTime > getDateString(lastWeekEnd)) return false;
                        break;
                    case 'thisMonthCompleted':
                        if (!todo.completed || !todo.endTime) return false;
                        if (todo.endTime < getDateString(thisMonthStart)) return false;
                        break;
                    case 'overdue':
                        if (todo.completed || !todo.due || todo.due >= today) return false;
                        break;
                    case 'dueToday':
                        if (todo.completed || todo.due !== today) return false;
                        break;
                    case 'dueThisWeek':
                        if (todo.completed || !todo.due) return false;
                        if (todo.due < getDateString(thisWeekStart) || todo.due > getDateString(thisWeekEnd)) return false;
                        break;
                    case 'byTag':
                        // 标签过滤已在上面处理，这里不额外过滤
                        break;
                    case 'all':
                        // 不过滤
                        break;
                }

                return true;
            });

            // 排序
            if (currentSort.column) {
                sortTodos();
            } else if (currentFilter === 'byTag' && currentTag) {
                // 按标签过滤时，如果没有用户选择的排序，默认未完成的在前面
                filteredTodos.sort((a, b) => {
                    // 未完成的在前（completed: false 排在前面）
                    if (a.completed !== b.completed) {
                        return a.completed ? 1 : -1;
                    }
                    return 0;
                });
            }

            renderTable();
            updateStats();
        }

        function sortTodos() {
            const { column, direction } = currentSort;
            const multiplier = direction === 'asc' ? 1 : -1;

            filteredTodos.sort((a, b) => {
                // 按标签过滤时，先按完成状态排序（未完成的在前）
                if (currentFilter === 'byTag' && currentTag) {
                    if (a.completed !== b.completed) {
                        return a.completed ? 1 : -1;
                    }
                }

                let aVal, bVal;

                switch (column) {
                    case 'content':
                        aVal = a.content.toLowerCase();
                        bVal = b.content.toLowerCase();
                        break;
                    case 'due':
                        aVal = a.due || '9999-12-31';
                        bVal = b.due || '9999-12-31';
                        break;
                    case 'endTime':
                        aVal = a.endTime || '9999-12-31';
                        bVal = b.endTime || '9999-12-31';
                        break;
                    case 'file':
                        aVal = a.fileName.toLowerCase();
                        bVal = b.fileName.toLowerCase();
                        break;
                    case 'tags':
                        aVal = (a.tags || []).join(',');
                        bVal = (b.tags || []).join(',');
                        break;
                    default:
                        return 0;
                }

                if (aVal < bVal) return -1 * multiplier;
                if (aVal > bVal) return 1 * multiplier;
                return 0;
            });
        }

        function updateSortIndicators() {
            document.querySelectorAll('th.sortable').forEach(th => {
                th.classList.remove('sorted-asc', 'sorted-desc');
                if (th.dataset.sort === currentSort.column) {
                    th.classList.add(currentSort.direction === 'asc' ? 'sorted-asc' : 'sorted-desc');
                }
            });
        }

        function renderTable() {
            const tbody = document.getElementById('todoBody');

            if (filteredTodos.length === 0) {
                tbody.innerHTML = \`
                    <tr>
                        <td colspan="6" class="empty-state">
                            没有找到 TODO 项
                        </td>
                    </tr>
                \`;
                return;
            }

            tbody.innerHTML = filteredTodos.map((todo, index) => {
                const dueDateClass = getDueDateClass(todo.due);
                const indentClass = \`indent-level-\${Math.min(todo.level, 4)}\`;

                const tagsText = (todo.tags || []).map(tag => \`#\${tag}\`).join(' ');
                
                return \`
                    <tr class="\${todo.completed ? 'completed' : ''}" data-todo-index="\${index}">
                        <td style="text-align: center; padding: 4px;">
                            <input type="checkbox" 
                                   class="status-checkbox" 
                                   \${todo.completed ? 'checked' : ''}
                                   data-todo-index="\${index}"
                                   title="\${todo.completed ? '标记为未完成' : '标记为完成'}">
                        </td>
                        <td class="content-cell \${indentClass}" 
                            data-todo-index="\${index}"
                            title="点击跳转到文件: \${todo.fileName}:\${todo.lineNumber}">
                            \${todo.content}
                        </td>
                        <td class="editable-cell" 
                            data-todo-index="\${index}" 
                            data-field="tags"
                            data-value="\${tagsText}"
                            title="标签 (双击编辑)">
                            <div class="tags">
                                \${(todo.tags || []).map(tag => \`<span class="tag">#\${tag}</span>\`).join('') || '<span style="opacity: 0.3; font-size: 11px;">-</span>'}
                            </div>
                        </td>
                        <td class="editable-cell due-date \${dueDateClass}" 
                            data-todo-index="\${index}" 
                            data-field="due"
                            data-value="\${todo.due || ''}"
                            title="截止日期: \${todo.due || '未设置'} (双击编辑)">\${todo.due ? formatShortDate(todo.due) : '<span style="opacity: 0.3;">-</span>'}</td>
                        <td style="text-align: center; font-size: 11px;" title="完成时间: \${todo.endTime || '未完成'}">
                            \${todo.endTime ? '<span style="color: var(--vscode-charts-green);">' + formatShortDate(todo.endTime) + '</span>' : '<span style="opacity: 0.3;">-</span>'}
                        </td>
                        <td style="font-size: 11px;">
                            <span class="file-link" data-todo-index="\${index}"
                                  title="跳转到: \${todo.fileName}:\${todo.lineNumber}">
                                \${todo.fileName.replace('.md', '')}
                            </span>
                        </td>
                    </tr>
                \`;
            }).join('');
        }

        function getDueDateClass(due) {
            if (!due) return '';
            const today = new Date().toISOString().split('T')[0];
            const tomorrow = new Date(Date.now() + 86400000).toISOString().split('T')[0];
            
            if (due < today) return 'overdue';
            if (due === today) return 'today';
            if (due === tomorrow) return 'upcoming';
            return '';
        }

        function updateStats() {
            const total = filteredTodos.length;
            const completed = filteredTodos.filter(t => t.completed).length;
            const pending = total - completed;

            let filterInfo = '';
            if (currentFilter === 'byTag' && currentTag) {
                filterInfo = \` | 标签: <strong>#\${currentTag}</strong>\`;
            }

            document.getElementById('stats').innerHTML = \`
                总计: <strong>\${total}</strong> | 
                未完成: <strong>\${pending}</strong> | 
                已完成: <strong>\${completed}</strong>\${filterInfo}
            \`;
        }

        function toggleTodo(todo) {
            vscode.postMessage({ type: 'toggleTodo', todo });
        }

        function openTodo(todo) {
            vscode.postMessage({ type: 'openTodo', todo });
        }

        function editTodo(todo) {
            vscode.postMessage({ type: 'editTodo', todo });
        }

        // 开始编辑单元格
        function startEdit(cell) {
            if (editingCell) return;
            
            editingCell = cell;
            const field = cell.getAttribute('data-field');
            const value = cell.getAttribute('data-value') || '';
            const index = parseInt(cell.getAttribute('data-todo-index') || '0');
            const todo = filteredTodos[index];
            
            cell.classList.add('editing');
            
            let input;
            if (field === 'due') {
                input = document.createElement('input');
                input.type = 'date';
                input.value = value;
            } else {
                input = document.createElement('input');
                input.type = 'text';
                input.value = value;
            }
            
            input.style.width = '100%';
            
            // 保存原始内容
            cell.setAttribute('data-original-html', cell.innerHTML);
            cell.innerHTML = '';
            cell.appendChild(input);
            input.focus();
            
            // 回车保存
            input.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') {
                    e.preventDefault();
                    saveEdit();
                } else if (e.key === 'Escape') {
                    e.preventDefault();
                    cancelEdit();
                }
            });
        }

        // 保存编辑
        function saveEdit() {
            if (!editingCell || isSaving) return;
            
            isSaving = true;
            
            const input = editingCell.querySelector('input');
            if (!input) {
                isSaving = false;
                return;
            }
            
            const field = editingCell.getAttribute('data-field');
            const newValue = input.value.trim();
            const oldValue = editingCell.getAttribute('data-value') || '';
            const index = parseInt(editingCell.getAttribute('data-todo-index') || '0');
            const todo = filteredTodos[index];
            
            // 保存引用后再清空
            const cellToRestore = editingCell;
            const originalHtml = cellToRestore.getAttribute('data-original-html');
            
            // 恢复原始显示
            cellToRestore.innerHTML = originalHtml;
            cellToRestore.classList.remove('editing');
            
            // 清空编辑状态
            editingCell = null;
            isSaving = false;
            
            // 如果值有变化，更新
            if (newValue !== oldValue) {
                updateTodoField(todo, field, newValue);
            }
        }

        // 取消编辑
        function cancelEdit() {
            if (!editingCell) return;
            
            const originalHtml = editingCell.getAttribute('data-original-html');
            editingCell.innerHTML = originalHtml;
            editingCell.classList.remove('editing');
            editingCell = null;
        }

        // 更新 TODO 字段
        function updateTodoField(todo, field, value) {
            const updates = {};
            
            if (field === 'tags') {
                // 将标签字符串转换为数组，移除 # 前缀
                const tagsStr = value.replace(/#/g, '').trim();
                updates.tags = tagsStr ? tagsStr.split(/\s+/) : [];
            } else if (field === 'due') {
                updates.due = value;
            }
            
            // 发送更新请求
            vscode.postMessage({ 
                type: 'editTodo', 
                todo: todo,
                updates: updates
            });
        }

        // 辅助函数：获取一周的开始日期（周一）
        function getWeekStart(date) {
            const d = new Date(date);
            const day = d.getDay();
            const diff = d.getDate() - day + (day === 0 ? -6 : 1);
            return new Date(d.setDate(diff));
        }

        // 辅助函数：将日期转换为 YYYY-MM-DD 格式
        function getDateString(date) {
            const year = date.getFullYear();
            const month = String(date.getMonth() + 1).padStart(2, '0');
            const day = String(date.getDate()).padStart(2, '0');
            return \`\${year}-\${month}-\${day}\`;
        }

        // 辅助函数：格式化短日期显示（如果是今年则只显示月-日）
        function formatShortDate(dateString) {
            if (!dateString) return '';
            const today = new Date();
            const currentYear = today.getFullYear();
            const [year, month, day] = dateString.split('-');
            
            // 如果是今年，只显示 月-日
            if (parseInt(year) === currentYear) {
                return \`\${month}-\${day}\`;
            }
            // 否则显示完整日期
            return dateString;
        }

        // 初始化
        vscode.postMessage({ type: 'refresh' });
    </script>
</body>
</html>`;
    }
}

function getNonce() {
    let text = '';
    const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    for (let i = 0; i < 32; i++) {
        text += possible.charAt(Math.floor(Math.random() * possible.length));
    }
    return text;
}

