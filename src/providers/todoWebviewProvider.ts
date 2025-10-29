/**
 * TODO WebView 提供者 - 使用表格展示 TODO 列表
 */

import * as vscode from 'vscode';
import { TodoItem, TodoPriority } from '../types';
import { extractTodosFromDirectory, toggleTodoStatus, updateTodoAttributes } from '../utils';
import { getNotesRootPath } from '../config';

export class TodoWebviewProvider implements vscode.WebviewViewProvider {
    public static readonly viewType = 'mementoTodoView';

    private _view?: vscode.WebviewView;
    private todos: TodoItem[] = [];

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
                todos: this.todos
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
            { label: '$(project) 编辑项目', value: 'project' },
            { label: '$(calendar) 设置截止日期', value: 'due' },
            { label: '$(star) 设置优先级', value: 'priority' }
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

            case 'project':
                const projectInput = await vscode.window.showInputBox({
                    prompt: '输入项目名称',
                    value: todo.project || '',
                    placeHolder: '例如: Q4Report'
                });
                if (projectInput !== undefined) {
                    dialogUpdates.project = projectInput.trim();
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

            case 'priority':
                const priorityOptions = [
                    { label: '$(alert) 高优先级 (H)', value: TodoPriority.HIGH },
                    { label: '$(dash) 中优先级 (M)', value: TodoPriority.MEDIUM },
                    { label: '$(chevron-down) 低优先级 (L)', value: TodoPriority.LOW },
                    { label: '$(circle-slash) 无优先级', value: TodoPriority.NONE }
                ];
                const priorityChoice = await vscode.window.showQuickPick(priorityOptions, {
                    placeHolder: '选择优先级'
                });
                if (priorityChoice) {
                    dialogUpdates.priority = priorityChoice.value;
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

        .toolbar {
            display: flex;
            gap: 8px;
            margin-bottom: 12px;
            padding: 8px;
            background-color: var(--vscode-editor-background);
            border-bottom: 1px solid var(--vscode-panel-border);
            flex-wrap: wrap;
        }

        .toolbar button {
            background: var(--vscode-button-background);
            color: var(--vscode-button-foreground);
            border: none;
            padding: 6px 12px;
            cursor: pointer;
            border-radius: 2px;
            font-size: 12px;
        }

        .toolbar button:hover {
            background: var(--vscode-button-hoverBackground);
        }

        .toolbar select {
            background: var(--vscode-dropdown-background);
            color: var(--vscode-dropdown-foreground);
            border: 1px solid var(--vscode-dropdown-border);
            padding: 4px 8px;
            border-radius: 2px;
            font-size: 12px;
        }

        .toolbar input[type="text"] {
            background: var(--vscode-input-background);
            color: var(--vscode-input-foreground);
            border: 1px solid var(--vscode-input-border);
            padding: 4px 8px;
            border-radius: 2px;
            font-size: 12px;
            flex: 1;
            min-width: 150px;
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
        }

        th:hover {
            background: var(--vscode-list-hoverBackground);
        }

        th.sortable::after {
            content: ' ⇅';
            opacity: 0.3;
        }

        th.sorted-asc::after {
            content: ' ↑';
            opacity: 1;
        }

        th.sorted-desc::after {
            content: ' ↓';
            opacity: 1;
        }

        td {
            padding: 8px;
            border-bottom: 1px solid var(--vscode-panel-border);
        }

        tr:hover {
            background: var(--vscode-list-hoverBackground);
        }

        tr.completed {
            opacity: 0.6;
        }

        .status-checkbox {
            cursor: pointer;
            width: 18px;
            height: 18px;
            margin: 0 auto;
            display: block;
        }

        .priority-high {
            color: #f44336;
            font-weight: bold;
        }

        .priority-medium {
            color: #ff9800;
        }

        .priority-low {
            color: #2196f3;
        }

        .priority-none {
            color: var(--vscode-foreground);
            opacity: 0.5;
        }

        .tags {
            display: flex;
            gap: 4px;
            flex-wrap: wrap;
        }

        .tag {
            background: var(--vscode-badge-background);
            color: var(--vscode-badge-foreground);
            padding: 2px 6px;
            border-radius: 3px;
            font-size: 11px;
        }

        .content-cell {
            cursor: pointer;
            max-width: 300px;
            overflow: hidden;
            text-overflow: ellipsis;
        }

        .content-cell:hover {
            text-decoration: underline;
        }

        .file-link {
            color: var(--vscode-textLink-foreground);
            cursor: pointer;
            text-decoration: none;
        }

        .file-link:hover {
            text-decoration: underline;
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

        .priority-cell {
            cursor: pointer;
        }

        .priority-cell:hover {
            background: var(--vscode-list-hoverBackground);
        }

        .due-date {
            white-space: nowrap;
        }

        .due-date.overdue {
            color: #f44336;
            font-weight: bold;
        }

        .due-date.today {
            color: #ff9800;
        }

        .due-date.upcoming {
            color: #4caf50;
        }

        .empty-state {
            text-align: center;
            padding: 40px;
            color: var(--vscode-descriptionForeground);
        }

        .empty-state-icon {
            font-size: 48px;
            margin-bottom: 16px;
        }

        .indent-level-1 { padding-left: 20px; }
        .indent-level-2 { padding-left: 40px; }
        .indent-level-3 { padding-left: 60px; }
        .indent-level-4 { padding-left: 80px; }
    </style>
</head>
<body>
    <div class="toolbar">
        <button id="refreshBtn" title="刷新">🔄 刷新</button>
        <input type="text" id="searchInput" placeholder="搜索 TODO...">
        <select id="filterStatus">
            <option value="all">全部状态</option>
            <option value="pending">未完成</option>
            <option value="completed">已完成</option>
        </select>
        <select id="filterPriority">
            <option value="all">全部优先级</option>
            <option value="H">高</option>
            <option value="M">中</option>
            <option value="L">低</option>
            <option value="none">无</option>
        </select>
        <select id="filterProject">
            <option value="all">全部项目</option>
        </select>
    </div>

    <div class="stats" id="stats"></div>

    <div class="table-container">
        <table id="todoTable">
            <thead>
                <tr>
                    <th style="width: 40px;">状态</th>
                    <th class="sortable" data-sort="priority" style="width: 80px;" title="点击切换优先级">优先级</th>
                    <th class="sortable" data-sort="content">内容</th>
                    <th class="sortable" data-sort="project" style="width: 120px;" title="双击编辑项目">项目</th>
                    <th class="sortable" data-sort="tags" style="width: 150px;" title="双击编辑标签">标签</th>
                    <th class="sortable" data-sort="due" style="width: 110px;" title="双击编辑截止日期">截止日期</th>
                    <th class="sortable" data-sort="file" style="width: 150px;">文件</th>
                </tr>
            </thead>
            <tbody id="todoBody">
                <tr>
                    <td colspan="7" class="empty-state">
                        <div class="empty-state-icon">📝</div>
                        <div>加载中...</div>
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

        // 接收来自扩展的消息
        window.addEventListener('message', event => {
            const message = event.data;
            switch (message.type) {
                case 'updateTodos':
                    allTodos = message.todos;
                    updateProjectFilter();
                    applyFilters();
                    break;
            }
        });

        // 刷新按钮
        document.getElementById('refreshBtn').addEventListener('click', () => {
            vscode.postMessage({ type: 'refresh' });
        });

        // 搜索
        document.getElementById('searchInput').addEventListener('input', (e) => {
            applyFilters();
        });

        // 过滤器
        document.getElementById('filterStatus').addEventListener('change', applyFilters);
        document.getElementById('filterPriority').addEventListener('change', applyFilters);
        document.getElementById('filterProject').addEventListener('change', applyFilters);

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
            
            // 处理优先级单元格点击 - 切换优先级
            if (target.classList.contains('priority-cell')) {
                const index = parseInt(target.getAttribute('data-todo-index') || '0');
                const todo = filteredTodos[index];
                if (todo) {
                    cyclePriority(todo);
                }
                return;
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

        function updateProjectFilter() {
            const projects = new Set();
            allTodos.forEach(todo => {
                if (todo.project) {
                    projects.add(todo.project);
                }
            });

            const select = document.getElementById('filterProject');
            const currentValue = select.value;
            select.innerHTML = '<option value="all">全部项目</option>';
            Array.from(projects).sort().forEach(project => {
                const option = document.createElement('option');
                option.value = project;
                option.textContent = project;
                select.appendChild(option);
            });
            select.value = currentValue;
        }

        function applyFilters() {
            const search = document.getElementById('searchInput').value.toLowerCase();
            const status = document.getElementById('filterStatus').value;
            const priority = document.getElementById('filterPriority').value;
            const project = document.getElementById('filterProject').value;

            filteredTodos = allTodos.filter(todo => {
                // 搜索过滤
                if (search && !todo.content.toLowerCase().includes(search)) {
                    return false;
                }

                // 状态过滤
                if (status === 'pending' && todo.completed) return false;
                if (status === 'completed' && !todo.completed) return false;

                // 优先级过滤
                if (priority !== 'all') {
                    if (priority === 'none' && todo.priority !== '') return false;
                    if (priority !== 'none' && todo.priority !== priority) return false;
                }

                // 项目过滤
                if (project !== 'all' && todo.project !== project) return false;

                return true;
            });

            // 排序
            if (currentSort.column) {
                sortTodos();
            }

            renderTable();
            updateStats();
        }

        function sortTodos() {
            const { column, direction } = currentSort;
            const multiplier = direction === 'asc' ? 1 : -1;

            filteredTodos.sort((a, b) => {
                let aVal, bVal;

                switch (column) {
                    case 'priority':
                        const priorityOrder = { 'H': 3, 'M': 2, 'L': 1, '': 0 };
                        aVal = priorityOrder[a.priority] || 0;
                        bVal = priorityOrder[b.priority] || 0;
                        break;
                    case 'content':
                        aVal = a.content.toLowerCase();
                        bVal = b.content.toLowerCase();
                        break;
                    case 'project':
                        aVal = a.project || '';
                        bVal = b.project || '';
                        break;
                    case 'due':
                        aVal = a.due || '9999-12-31';
                        bVal = b.due || '9999-12-31';
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
                        <td colspan="7" class="empty-state">
                            <div class="empty-state-icon">📭</div>
                            <div>没有找到 TODO 项</div>
                        </td>
                    </tr>
                \`;
                return;
            }

            tbody.innerHTML = filteredTodos.map((todo, index) => {
                const priorityClass = \`priority-\${todo.priority ? todo.priority.toLowerCase() : 'none'}\`;
                const priorityText = todo.priority ? \`[\${todo.priority}]\` : '-';
                const dueDateClass = getDueDateClass(todo.due);
                const indentClass = \`indent-level-\${Math.min(todo.level, 4)}\`;

                const tagsText = (todo.tags || []).map(tag => \`#\${tag}\`).join(' ');
                
                return \`
                    <tr class="\${todo.completed ? 'completed' : ''}" data-todo-index="\${index}">
                        <td style="text-align: center;">
                            <input type="checkbox" 
                                   class="status-checkbox" 
                                   \${todo.completed ? 'checked' : ''}
                                   data-todo-index="\${index}">
                        </td>
                        <td class="priority-cell \${priorityClass}" 
                            data-todo-index="\${index}" 
                            data-field="priority"
                            title="点击切换优先级">\${priorityText}</td>
                        <td class="content-cell \${indentClass}" 
                            data-todo-index="\${index}"
                            title="点击跳转到文件">
                            \${todo.content}
                        </td>
                        <td class="editable-cell" 
                            data-todo-index="\${index}" 
                            data-field="project"
                            data-value="\${todo.project || ''}"
                            title="双击编辑项目">\${todo.project || '-'}</td>
                        <td class="editable-cell" 
                            data-todo-index="\${index}" 
                            data-field="tags"
                            data-value="\${tagsText}"
                            title="双击编辑标签">
                            <div class="tags">
                                \${(todo.tags || []).map(tag => \`<span class="tag">#\${tag}</span>\`).join('') || '-'}
                            </div>
                        </td>
                        <td class="editable-cell due-date \${dueDateClass}" 
                            data-todo-index="\${index}" 
                            data-field="due"
                            data-value="\${todo.due || ''}"
                            title="双击编辑截止日期">\${todo.due || '-'}</td>
                        <td>
                            <span class="file-link" data-todo-index="\${index}"
                                  title="\${todo.fileName} (行 \${todo.lineNumber})">
                                \${todo.fileName}
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
            const highPriority = filteredTodos.filter(t => t.priority === 'H' && !t.completed).length;

            document.getElementById('stats').innerHTML = \`
                总计: <strong>\${total}</strong> | 
                未完成: <strong>\${pending}</strong> | 
                已完成: <strong>\${completed}</strong> | 
                高优先级: <strong class="priority-high">\${highPriority}</strong>
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

        // 切换优先级
        function cyclePriority(todo) {
            const priorities = ['', 'L', 'M', 'H'];
            const currentIndex = priorities.indexOf(todo.priority);
            const nextIndex = (currentIndex + 1) % priorities.length;
            const newPriority = priorities[nextIndex];
            
            updateTodoField(todo, 'priority', newPriority);
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
            } else if (field === 'project') {
                updates.project = value;
            } else if (field === 'due') {
                updates.due = value;
            } else if (field === 'priority') {
                updates.priority = value;
            }
            
            // 发送更新请求
            vscode.postMessage({ 
                type: 'editTodo', 
                todo: todo,
                updates: updates
            });
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

