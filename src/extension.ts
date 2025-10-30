/**
 * Memento VSCode 扩展主文件
 * 轻量级 Markdown 笔记管理扩展
 */

import * as vscode from 'vscode';
import { MainTreeProvider, TodoWebviewProvider, TodoControlProvider } from './providers';
import { registerCommands } from './commands';
import { getNotesRootPath } from './config';
import { extractTodosFromDirectory } from './utils';

/**
 * 扩展激活函数
 * 当扩展首次被激活时调用
 */
export function activate(context: vscode.ExtensionContext) {
    // 输出诊断信息
	console.log('Memento extension is now active!');

    // 创建主树数据提供者
	const mainProvider = new MainTreeProvider();

    // 注册主树视图
	const treeView = vscode.window.createTreeView('mementoMainView', {
		treeDataProvider: mainProvider,
		showCollapseAll: true
	});

	context.subscriptions.push(treeView);
	console.log('Main tree view registered');

    // 注册 TODO 控制面板提供者
    const todoControlProvider = new TodoControlProvider();
    const todoControlTreeView = vscode.window.createTreeView('mementoTodoControlView', {
        treeDataProvider: todoControlProvider,
        showCollapseAll: false
    });
    context.subscriptions.push(todoControlTreeView);
    console.log('TODO Control tree view registered');

    // 注册 TODO WebView 提供者（侧边栏视图模式）
    const todoWebviewProvider = new TodoWebviewProvider(context.extensionUri);
    context.subscriptions.push(
        vscode.window.registerWebviewViewProvider(
            TodoWebviewProvider.viewType,
            todoWebviewProvider,
            {
                webviewOptions: {
                    retainContextWhenHidden: true
                }
            }
        )
    );
    console.log('TODO WebView provider registered');

    // 注册所有命令
    registerCommands(context, mainProvider, todoWebviewProvider, todoControlProvider);
    console.log('All commands registered');

    // 初始化 TODO 数据
    refreshTodoViews(todoWebviewProvider, todoControlProvider);

    // 设置文件系统监听器以自动刷新
    setupFileWatcher(context, mainProvider, todoWebviewProvider, todoControlProvider);
    console.log('File watcher setup completed');
}

/**
 * 设置文件系统监听器
 * 监听 Markdown 文件的创建、修改和删除
 */
async function setupFileWatcher(context: vscode.ExtensionContext, mainProvider: MainTreeProvider, todoWebviewProvider: TodoWebviewProvider, todoControlProvider?: TodoControlProvider): Promise<void> {
    try {
        const notesPath = await getNotesRootPath();
        if (!notesPath) {
            console.log('No notes path available, skipping file watcher setup');
            return;
        }

        // 创建文件系统监听器，监听 .md 文件
        const watcher = vscode.workspace.createFileSystemWatcher(
            new vscode.RelativePattern(notesPath, '**/*.md')
        );

        // 监听文件创建
        watcher.onDidCreate(async () => {
            console.log('File created, refreshing tree view');
            mainProvider.refresh();
            await refreshTodoViews(todoWebviewProvider, todoControlProvider);
        });

        // 监听文件修改
        watcher.onDidChange(async () => {
            console.log('File changed, refreshing tree view');
            mainProvider.refresh();
            await refreshTodoViews(todoWebviewProvider, todoControlProvider);
        });

        // 监听文件删除
        watcher.onDidDelete(async () => {
            console.log('File deleted, refreshing tree view');
            mainProvider.refresh();
            await refreshTodoViews(todoWebviewProvider, todoControlProvider);
        });

        // 将监听器添加到订阅中，确保在扩展停用时清理
        context.subscriptions.push(watcher);
        console.log(`File watcher setup for: ${notesPath}`);
    } catch (error) {
        console.error('Error setting up file watcher:', error);
    }
}

/**
 * 刷新 TODO 相关视图
 */
async function refreshTodoViews(todoWebviewProvider: TodoWebviewProvider, todoControlProvider?: TodoControlProvider): Promise<void> {
    const notesPath = await getNotesRootPath();
    if (notesPath) {
        const todos = await extractTodosFromDirectory(notesPath);
        if (todoControlProvider) {
            todoControlProvider.updateTodos(todos);
        }
    }
    todoWebviewProvider.refresh();
}

/**
 * 扩展停用函数
 * 当扩展被停用时调用
 */
export function deactivate() {
    // 清理资源
}
