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

    // 创建 TODO 控制面板提供者（需要先创建，因为 mainProvider 需要它）
    const todoControlProvider = new TodoControlProvider();

    // 创建主树数据提供者
	const mainProvider = new MainTreeProvider(todoControlProvider);

    // 注册主树视图
	const treeView = vscode.window.createTreeView('mementoMainView', {
		treeDataProvider: mainProvider,
		showCollapseAll: true
	});

	context.subscriptions.push(treeView);
	console.log('Main tree view registered');

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

    // 检查是否是首次使用并显示欢迎信息
    checkFirstTimeUse(context);
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
 * 检查是否是首次使用并显示欢迎信息
 */
async function checkFirstTimeUse(context: vscode.ExtensionContext): Promise<void> {
    try {
        // 检查是否已经显示过欢迎信息
        const hasShownWelcome = context.globalState.get<boolean>('memento.hasShownWelcome', false);
        
        if (hasShownWelcome) {
            return;
        }

        const notesPath = await getNotesRootPath();
        if (!notesPath) {
            // 没有工作区，稍后检查
            return;
        }

        // 检查是否有 Markdown 文件
        const fs = await import('fs');
        const path = await import('path');
        
        async function hasMarkdownFiles(dir: string): Promise<boolean> {
            try {
                const items = await fs.promises.readdir(dir, { withFileTypes: true });
                for (const item of items) {
                    if (item.isDirectory() && !item.name.startsWith('.') && item.name !== 'node_modules') {
                        if (await hasMarkdownFiles(path.join(dir, item.name))) {
                            return true;
                        }
                    } else if (item.isFile() && item.name.endsWith('.md')) {
                        return true;
                    }
                }
            } catch (error) {
                // 忽略错误
            }
            return false;
        }

        const hasFiles = await hasMarkdownFiles(notesPath);
        
        // 如果没有文件，显示欢迎信息
        if (!hasFiles) {
            const action = await vscode.window.showInformationMessage(
                '欢迎使用 Memento！这是一个轻量级的 Markdown 笔记管理插件。',
                '📝 创建第一个笔记',
                '⚙️ 设置笔记根目录',
                '📖 查看文档'
            );

            if (action === '📝 创建第一个笔记') {
                await vscode.commands.executeCommand('memento.createNote');
            } else if (action === '⚙️ 设置笔记根目录') {
                await vscode.commands.executeCommand('workbench.action.openSettings', 'memento.notesPath');
            } else if (action === '📖 查看文档') {
                await vscode.env.openExternal(vscode.Uri.parse('https://github.com/wenyg/memento#readme'));
            }

            // 标记已显示欢迎信息
            await context.globalState.update('memento.hasShownWelcome', true);
        } else {
            // 有文件，也标记已显示，避免再次显示
            await context.globalState.update('memento.hasShownWelcome', true);
        }
    } catch (error) {
        console.error('Error checking first time use:', error);
    }
}

/**
 * 扩展停用函数
 * 当扩展被停用时调用
 */
export function deactivate() {
    // 清理资源
}
