/**
 * Memento VSCode 扩展主文件
 * 轻量级 Markdown 笔记管理扩展
 */

import * as vscode from 'vscode';
import { MainTreeProvider } from './providers';
import { registerCommands } from './commands';

/**
 * 扩展激活函数
 * 当扩展首次被激活时调用
 */
export function activate(context: vscode.ExtensionContext) {
    // 输出诊断信息
	console.log('Memento extension is now active!');
    console.log('[Memento Debug] 扩展开始激活');

    // 创建主树数据提供者
	const mainProvider = new MainTreeProvider();
    console.log('[Memento Debug] MainTreeProvider 已创建');

    // 注册主树视图
	const treeView = vscode.window.createTreeView('mementoMainView', {
		treeDataProvider: mainProvider,
		showCollapseAll: true
	});

	context.subscriptions.push(treeView);
	console.log('Main tree view registered');

    // 注册所有命令
    registerCommands(context, mainProvider);
    console.log('All commands registered');
}

/**
 * 扩展停用函数
 * 当扩展被停用时调用
 */
export function deactivate() {
    // 清理资源
}
