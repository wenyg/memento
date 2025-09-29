// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';

interface MdFileInfo {
	path: string;
	birthtime: Date;
	relativePath: string;
	displayTitle: string;
	tags?: string[];
}

interface TagInfo {
	tag: string;
	files: MdFileInfo[];
	children?: TagInfo[];
}

class MdFileItem extends vscode.TreeItem {
	constructor(
		public readonly fileInfo: MdFileInfo,
		public readonly collapsibleState: vscode.TreeItemCollapsibleState
	) {
		super(fileInfo.displayTitle, collapsibleState);
		this.tooltip = `${this.fileInfo.relativePath}\nCreated: ${this.fileInfo.birthtime.toLocaleString()}`;
		this.description = this.fileInfo.birthtime.toLocaleDateString();
		this.resourceUri = vscode.Uri.file(this.fileInfo.path);
		this.command = {
			command: 'markdown.showPreview',
			title: 'Open Preview',
			arguments: [this.resourceUri]
		};
		this.contextValue = 'mdFile';
		this.iconPath = new vscode.ThemeIcon('markdown');
	}
}

class TagItem extends vscode.TreeItem {
	constructor(
		public readonly tagInfo: TagInfo,
		public readonly collapsibleState: vscode.TreeItemCollapsibleState,
		public readonly isFile: boolean = false,
		public readonly fileInfo?: MdFileInfo
	) {
		// Call super constructor first
		super(
			isFile && fileInfo ? fileInfo.displayTitle : tagInfo.tag,
			collapsibleState
		);

		if (isFile && fileInfo) {
			this.tooltip = `${fileInfo.relativePath}\nCreated: ${fileInfo.birthtime.toLocaleString()}`;
			this.description = fileInfo.birthtime.toLocaleDateString();
			this.resourceUri = vscode.Uri.file(fileInfo.path);
			this.command = {
				command: 'markdown.showPreview',
				title: 'Open Preview',
				arguments: [this.resourceUri]
			};
			this.contextValue = 'mdFile';
			this.iconPath = new vscode.ThemeIcon('markdown');
		} else {
			this.tooltip = `Tag: ${tagInfo.tag} (${tagInfo.files.length} files)`;
			this.description = `${tagInfo.files.length} files`;
			this.contextValue = 'tag';
			this.iconPath = new vscode.ThemeIcon('tag');
			this.command = {
				command: 'memento.showTagFiles',
				title: 'Show Tag Files',
				arguments: [tagInfo]
			};
		}
	}
}

class MdFilesProvider implements vscode.TreeDataProvider<MdFileItem> {
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
			// Root level - return all markdown files
			return Promise.resolve(
				this.mdFiles.map(fileInfo =>
					new MdFileItem(fileInfo, vscode.TreeItemCollapsibleState.None)
				)
			);
		}
		return Promise.resolve([]);
	}

	private async _loadMarkdownFiles(): Promise<void> {
		const workspaceFolders = vscode.workspace.workspaceFolders;
		if (!workspaceFolders) {
			console.log('MdFilesProvider: No workspace folders');
			this.mdFiles = [];
			return;
		}

		try {
			const rootPath = workspaceFolders[0].uri.fsPath;
			console.log('MdFilesProvider: Searching in:', rootPath);
			const mdFiles = await findMarkdownFiles(rootPath);
			console.log('MdFilesProvider: Found files:', mdFiles.length);

			// Sort by creation time (oldest first)
			this.mdFiles = mdFiles.sort((a, b) => a.birthtime.getTime() - b.birthtime.getTime());
			console.log('MdFilesProvider: Files loaded and sorted');
		} catch (error) {
			console.error('MdFilesProvider: Error loading files:', error);
			this.mdFiles = [];
		}
	}
}

class TagTreeProvider implements vscode.TreeDataProvider<TagItem> {
	private _onDidChangeTreeData: vscode.EventEmitter<TagItem | undefined | null | void> = new vscode.EventEmitter<TagItem | undefined | null | void>();
	readonly onDidChangeTreeData: vscode.Event<TagItem | undefined | null | void> = this._onDidChangeTreeData.event;

	private tagTree: TagInfo[] = [];
	private mdFiles: MdFileInfo[] = [];

	constructor() {
		this.refresh();
	}

	refresh(): void {
		console.log('TagTreeProvider: Refreshing tree data');
		this._loadMarkdownFiles().then(() => {
			this.buildTagTree();
			this._onDidChangeTreeData.fire();
		});
	}

	getTreeItem(element: TagItem): vscode.TreeItem {
		return element;
	}

	getChildren(element?: TagItem): Thenable<TagItem[]> {
		if (!element) {
			// Root level - return tag hierarchy
			return Promise.resolve(
				this.tagTree.map(tagInfo => {
					const hasChildren = (tagInfo.children && tagInfo.children.length > 0) || tagInfo.files.length > 0;
					return new TagItem(
						tagInfo,
						hasChildren ? vscode.TreeItemCollapsibleState.Collapsed : vscode.TreeItemCollapsibleState.None
					);
				})
			);
		} else if (!element.isFile) {
			// Tag level - return children tags and files
			const items: TagItem[] = [];

			// Add child tags first
			if (element.tagInfo.children) {
				items.push(...element.tagInfo.children.map(childTagInfo => {
					const hasChildren = (childTagInfo.children && childTagInfo.children.length > 0) || childTagInfo.files.length > 0;
					return new TagItem(
						childTagInfo,
						hasChildren ? vscode.TreeItemCollapsibleState.Collapsed : vscode.TreeItemCollapsibleState.None
					);
				}));
			}

			// Add files
			items.push(...element.tagInfo.files.map(fileInfo =>
				new TagItem(
					element.tagInfo,
					vscode.TreeItemCollapsibleState.None,
					true,
					fileInfo
				)
			));

			return Promise.resolve(items);
		}

		return Promise.resolve([]);
	}

	private async _loadMarkdownFiles(): Promise<void> {
		const workspaceFolders = vscode.workspace.workspaceFolders;
		if (!workspaceFolders) {
			console.log('TagTreeProvider: No workspace folders');
			this.mdFiles = [];
			return;
		}

		try {
			const rootPath = workspaceFolders[0].uri.fsPath;
			console.log('TagTreeProvider: Searching in:', rootPath);
			const mdFiles = await findMarkdownFilesWithTags(rootPath);
			console.log('TagTreeProvider: Found files:', mdFiles.length);

			this.mdFiles = mdFiles;
			console.log('TagTreeProvider: Files loaded');
		} catch (error) {
			console.error('TagTreeProvider: Error loading files:', error);
			this.mdFiles = [];
		}
	}

	private buildTagTree(): void {
		const tagMap = new Map<string, TagInfo>();

		// Process all files and their tags
		for (const file of this.mdFiles) {
			if (!file.tags || file.tags.length === 0) {
				continue;
			}

			for (const tag of file.tags) {
				this.addTagToTree(tag, file, tagMap);
			}
		}

		// Convert map to tree structure
		this.tagTree = Array.from(tagMap.values()).filter(tagInfo => !tagInfo.tag.includes('/'));

		// Sort tags alphabetically
		this.sortTagTree(this.tagTree);
	}

	private addTagToTree(tag: string, file: MdFileInfo, tagMap: Map<string, TagInfo>): void {
		const parts = tag.split('/');
		let currentPath = '';

		for (let i = 0; i < parts.length; i++) {
			const part = parts[i];
			const parentPath = currentPath;
			currentPath = currentPath ? `${currentPath}/${part}` : part;

			if (!tagMap.has(currentPath)) {
				tagMap.set(currentPath, {
					tag: part,
					files: [],
					children: []
				});
			}

			const tagInfo = tagMap.get(currentPath)!;

			// Add file to the deepest level tag
			if (i === parts.length - 1) {
				if (!tagInfo.files.some(f => f.path === file.path)) {
					tagInfo.files.push(file);
				}
			}

			// Link parent-child relationships
			if (parentPath) {
				const parentTagInfo = tagMap.get(parentPath)!;
				if (!parentTagInfo.children!.some(child => child.tag === part)) {
					parentTagInfo.children!.push(tagInfo);
				}
			}
		}
	}

	private sortTagTree(tagTree: TagInfo[]): void {
		tagTree.sort((a, b) => a.tag.localeCompare(b.tag));
		for (const tagInfo of tagTree) {
			if (tagInfo.children) {
				this.sortTagTree(tagInfo.children);
			}
			tagInfo.files.sort((a, b) => a.relativePath.localeCompare(b.relativePath));
		}
	}
}

enum ViewMode {
	FILES = 'files',
	TAGS = 'tags'
}

class MainTreeProvider implements vscode.TreeDataProvider<MdFileItem | TagItem> {
	private _onDidChangeTreeData: vscode.EventEmitter<MdFileItem | TagItem | undefined | null | void> = new vscode.EventEmitter<MdFileItem | TagItem | undefined | null | void>();
	readonly onDidChangeTreeData: vscode.Event<MdFileItem | TagItem | undefined | null | void> = this._onDidChangeTreeData.event;

	private currentMode: ViewMode = ViewMode.FILES;
	private fileProvider: MdFilesProvider;
	private tagProvider: TagTreeProvider;

	constructor() {
		this.fileProvider = new MdFilesProvider();
		this.tagProvider = new TagTreeProvider();

		// Listen to changes from both providers
		this.fileProvider.onDidChangeTreeData(() => {
			if (this.currentMode === ViewMode.FILES) {
				this._onDidChangeTreeData.fire();
			}
		});

		this.tagProvider.onDidChangeTreeData(() => {
			if (this.currentMode === ViewMode.TAGS) {
				this._onDidChangeTreeData.fire();
			}
		});
	}

	switchToFileView(): void {
		this.currentMode = ViewMode.FILES;
		this._onDidChangeTreeData.fire();
	}

	switchToTagView(): void {
		this.currentMode = ViewMode.TAGS;
		this._onDidChangeTreeData.fire();
	}

	refresh(): void {
		if (this.currentMode === ViewMode.FILES) {
			this.fileProvider.refresh();
		} else {
			this.tagProvider.refresh();
		}
	}

	getTreeItem(element: MdFileItem | TagItem): vscode.TreeItem {
		return element;
	}

	getChildren(element?: MdFileItem | TagItem): Thenable<(MdFileItem | TagItem)[]> {
		if (this.currentMode === ViewMode.FILES) {
			return this.fileProvider.getChildren(element as MdFileItem);
		} else {
			return this.tagProvider.getChildren(element as TagItem);
		}
	}
}

// Global WebView panel for tag files
let tagFilesPanel: vscode.WebviewPanel | undefined;

// This method is called when your extension is activated
// Your extension is activated the very first time the command is executed
export function activate(context: vscode.ExtensionContext) {

	// Use the console to output diagnostic information (console.log) and errors (console.error)
	// This line of code will only be executed once when your extension is activated
	console.log('Memento extension is now active!');

	// Create the main tree data provider
	const mainProvider = new MainTreeProvider();

	// Register the main tree view
	const treeView = vscode.window.createTreeView('mementoMainView', {
		treeDataProvider: mainProvider,
		showCollapseAll: true
	});

	context.subscriptions.push(treeView);

	console.log('Main tree view registered');

	// The command has been defined in the package.json file
	// Now provide the implementation of the command with registerCommand
	// The commandId parameter must match the command field in package.json
	const disposable = vscode.commands.registerCommand('memento.helloWorld', () => {
		// The code you place here will be executed every time your command is executed
		// Display a message box to the user
		vscode.window.showInformationMessage('Hello World from memento!');
	});

	context.subscriptions.push(disposable);

	// Register the listMdFiles command (now just shows a message)
	const listMdFilesDisposable = vscode.commands.registerCommand('memento.listMdFiles', async () => {
		vscode.window.showInformationMessage('Use the Memento sidebar to view markdown files!');
	});

	context.subscriptions.push(listMdFilesDisposable);

	// Register view switching commands
	const switchToFileViewDisposable = vscode.commands.registerCommand('memento.switchToFileView', () => {
		console.log('Switch to file view command triggered');
		mainProvider.switchToFileView();
	});

	const switchToTagViewDisposable = vscode.commands.registerCommand('memento.switchToTagView', () => {
		console.log('Switch to tag view command triggered');
		mainProvider.switchToTagView();
	});

	const refreshDisposable = vscode.commands.registerCommand('memento.refreshMdFiles', () => {
		console.log('Refresh command triggered');
		mainProvider.refresh();
	});

	const showTagFilesDisposable = vscode.commands.registerCommand('memento.showTagFiles', (tagInfo: TagInfo) => {
		console.log('Show tag files command triggered for tag:', tagInfo.tag);
		showTagFilesInEditor(tagInfo);
	});

	context.subscriptions.push(switchToFileViewDisposable);
	context.subscriptions.push(switchToTagViewDisposable);
	context.subscriptions.push(refreshDisposable);
	context.subscriptions.push(showTagFilesDisposable);
}

async function findMarkdownFiles(dir: string): Promise<Array<{path: string, birthtime: Date, relativePath: string, displayTitle: string}>> {
	const mdFiles: Array<{path: string, birthtime: Date, relativePath: string, displayTitle: string}> = [];

	async function scanDirectory(currentDir: string, rootDir: string) {
		const items = await fs.promises.readdir(currentDir);

		for (const item of items) {
			const itemPath = path.join(currentDir, item);
			const stats = await fs.promises.stat(itemPath);

			if (stats.isDirectory()) {
				// Skip node_modules and .git directories
				if (item !== 'node_modules' && item !== '.git' && !item.startsWith('.')) {
					await scanDirectory(itemPath, rootDir);
				}
			} else if (stats.isFile() && path.extname(item).toLowerCase() === '.md') {
				const relativePath = path.relative(rootDir, itemPath);
				const displayTitle = await extractFirstHeading(itemPath);
				mdFiles.push({
					path: itemPath,
					birthtime: stats.birthtime,
					relativePath: relativePath,
					displayTitle: displayTitle
				});
			}
		}
	}

	await scanDirectory(dir, dir);
	return mdFiles;
}

async function findMarkdownFilesWithTags(dir: string): Promise<MdFileInfo[]> {
	const mdFiles: MdFileInfo[] = [];

	async function scanDirectory(currentDir: string, rootDir: string) {
		const items = await fs.promises.readdir(currentDir);

		for (const item of items) {
			const itemPath = path.join(currentDir, item);
			const stats = await fs.promises.stat(itemPath);

			if (stats.isDirectory()) {
				// Skip node_modules and .git directories
				if (item !== 'node_modules' && item !== '.git' && !item.startsWith('.')) {
					await scanDirectory(itemPath, rootDir);
				}
			} else if (stats.isFile() && path.extname(item).toLowerCase() === '.md') {
				const relativePath = path.relative(rootDir, itemPath);
				const displayTitle = await extractFirstHeading(itemPath);
				const tags = await extractTagsFromFile(itemPath);
				mdFiles.push({
					path: itemPath,
					birthtime: stats.birthtime,
					relativePath: relativePath,
					displayTitle: displayTitle,
					tags: tags
				});
			}
		}
	}

	await scanDirectory(dir, dir);
	return mdFiles;
}

async function extractTagsFromFile(filePath: string): Promise<string[]> {
	try {
		const content = await fs.promises.readFile(filePath, 'utf-8');
		const tags: string[] = [];

		// Match #tag or #level1/level2 patterns, supporting Chinese characters
		// \p{L} matches any Unicode letter (including Chinese), \p{N} matches any Unicode number
		const tagRegex = /#([\p{L}\p{N}_\-\/]+)/gu;
		let match;

		while ((match = tagRegex.exec(content)) !== null) {
			const tag = match[1];
			if (!tags.includes(tag)) {
				tags.push(tag);
			}
		}

		return tags;
	} catch (error) {
		console.error(`Error reading file ${filePath}:`, error);
		return [];
	}
}

async function extractFirstHeading(filePath: string): Promise<string> {
	try {
		const content = await fs.promises.readFile(filePath, 'utf-8');

		// Match first level 1 heading (# title)
		const headingMatch = content.match(/^#\s+(.+)$/m);
		if (headingMatch) {
			return headingMatch[1].trim();
		}

		// If no heading found, return just the filename without extension
		const fileName = path.basename(filePath, '.md');
		return fileName;
	} catch (error) {
		console.error(`Error reading file ${filePath}:`, error);
		// Fallback to filename without extension
		return path.basename(filePath, '.md');
	}
}

function collectAllTagFiles(tagInfo: TagInfo): MdFileInfo[] {
	const allFiles: MdFileInfo[] = [];

	// Add files from current tag
	allFiles.push(...tagInfo.files);

	// Recursively add files from child tags
	if (tagInfo.children) {
		for (const childTag of tagInfo.children) {
			allFiles.push(...collectAllTagFiles(childTag));
		}
	}

	return allFiles;
}

// 移除自定义 markdown 转换，改用专业库

async function showTagFilesInEditor(tagInfo: TagInfo): Promise<void> {
	try {
		const allFiles = collectAllTagFiles(tagInfo);

		if (allFiles.length === 0) {
			vscode.window.showInformationMessage(`No files found for tag "${tagInfo.tag}"`);
			return;
		}

		// Sort files by creation time (newest first)
		const sortedFiles = allFiles.sort((a, b) => b.birthtime.getTime() - a.birthtime.getTime());

		// Create or reuse WebView panel
		if (!tagFilesPanel) {
			tagFilesPanel = vscode.window.createWebviewPanel(
				'tagFiles',
				`Tag Files`,
				vscode.ViewColumn.Beside,
				{
					enableScripts: true,
					retainContextWhenHidden: true
				}
			);

			// Handle panel disposal
			tagFilesPanel.onDidDispose(() => {
				tagFilesPanel = undefined;
			});
		}

		// Update the panel title and reveal it
		tagFilesPanel.title = `Tag: ${tagInfo.tag}`;
		tagFilesPanel.reveal(vscode.ViewColumn.Beside);

		// Process files and read raw content (rendering will be done in React)
		const processedFiles = [];
		for (const file of sortedFiles) {
			try {
				// Read the file content
				const fileContent = await fs.promises.readFile(file.path, 'utf-8');

				processedFiles.push({
					...file,
					rawContent: fileContent
				});

			} catch (error) {
				console.error(`Error reading file ${file.path}:`, error);
				processedFiles.push({
					...file,
					rawContent: 'Error reading file content',
					error: true
				});
			}
		}

		// Create the complete HTML with React
		const html = `
			<!DOCTYPE html>
			<html lang="en">
			<head>
				<meta charset="UTF-8">
				<meta name="viewport" content="width=device-width, initial-scale=1.0">
				<title>Tag: ${tagInfo.tag}</title>
				<script crossorigin src="https://unpkg.com/react@18/umd/react.development.js"></script>
				<script crossorigin src="https://unpkg.com/react-dom@18/umd/react-dom.development.js"></script>
				<script src="https://unpkg.com/@babel/standalone@7.23.6/babel.min.js"></script>
				<script src="https://cdn.jsdelivr.net/npm/marked@9.1.6/marked.min.js"></script>
				<script src="https://cdn.jsdelivr.net/gh/highlightjs/cdn-release@11.9.0/build/highlight.min.js"></script>
				<link rel="stylesheet" href="https://cdn.jsdelivr.net/gh/highlightjs/cdn-release@11.9.0/build/styles/github-dark.min.css">
				<style>
					* {
						margin: 0;
						padding: 0;
						box-sizing: border-box;
					}
					body {
						font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
						background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
						min-height: 100vh;
						color: #333;
					}
					#root {
						width: 100%;
						height: 100vh;
					}
					.app-container {
						padding: 20px;
						max-width: 1200px;
						margin: 0 auto;
						height: 100vh;
						overflow-y: auto;
					}
					.header {
						text-align: center;
						margin-bottom: 30px;
						background: rgba(255, 255, 255, 0.95);
						padding: 20px;
						border-radius: 15px;
						box-shadow: 0 8px 32px rgba(0, 0, 0, 0.1);
						backdrop-filter: blur(10px);
						animation: slideInDown 0.6s ease-out;
					}
					.header h1 {
						margin: 0;
						color: #333;
						font-size: 2.5em;
						font-weight: 300;
					}
					.file-count {
						color: #666;
						font-size: 1.1em;
						margin-top: 10px;
					}
					.search-container {
						margin: 20px 0;
						position: relative;
					}
					.search-input {
						width: 100%;
						padding: 12px 20px;
						border: none;
						border-radius: 25px;
						font-size: 1em;
						background: rgba(255, 255, 255, 0.9);
						box-shadow: 0 4px 20px rgba(0, 0, 0, 0.1);
						outline: none;
						transition: all 0.3s ease;
					}
					.search-input:focus {
						background: white;
						box-shadow: 0 8px 30px rgba(0, 0, 0, 0.2);
						transform: translateY(-2px);
					}
					.files-grid {
						display: grid;
						gap: 20px;
						grid-template-columns: repeat(auto-fill, minmax(400px, 1fr));
					}
					.file-card {
						background: rgba(255, 255, 255, 0.95);
						border-radius: 15px;
						overflow: hidden;
						box-shadow: 0 8px 32px rgba(0, 0, 0, 0.1);
						backdrop-filter: blur(10px);
						transition: all 0.3s ease;
						animation: fadeInUp 0.6s ease-out;
						cursor: pointer;
					}
					.file-card:hover {
						transform: translateY(-10px) scale(1.02);
						box-shadow: 0 20px 50px rgba(0, 0, 0, 0.2);
					}
					.file-header {
						background: linear-gradient(45deg, #ff6b6b, #4ecdc4);
						color: white;
						padding: 20px;
						position: relative;
						overflow: hidden;
					}
					.file-header::before {
						content: '';
						position: absolute;
						top: -50%;
						left: -50%;
						width: 200%;
						height: 200%;
						background: linear-gradient(45deg, transparent, rgba(255,255,255,0.1), transparent);
						transform: rotate(45deg);
						transition: all 0.5s;
					}
					.file-card:hover .file-header::before {
						animation: shimmer 1s ease-in-out;
					}
					.file-title {
						margin: 0 0 10px 0;
						font-size: 1.5em;
						font-weight: 500;
						z-index: 1;
						position: relative;
					}
					.file-meta {
						display: flex;
						justify-content: space-between;
						align-items: center;
						opacity: 0.9;
						z-index: 1;
						position: relative;
					}
					.file-path {
						font-size: 0.9em;
						font-family: 'Courier New', monospace;
						background: rgba(255, 255, 255, 0.2);
						padding: 4px 8px;
						border-radius: 4px;
					}
					.file-date {
						font-size: 0.9em;
					}
					.file-content {
						padding: 30px;
						line-height: 1.6;
						font-size: 1em;
						max-height: 300px;
						overflow-y: auto;
						position: relative;
					}
					.expand-btn {
						position: absolute;
						bottom: 10px;
						right: 10px;
						background: linear-gradient(45deg, #ff6b6b, #4ecdc4);
						color: white;
						border: none;
						border-radius: 20px;
						padding: 8px 16px;
						cursor: pointer;
						font-size: 0.9em;
						transition: all 0.3s ease;
					}
					.expand-btn:hover {
						transform: scale(1.1);
						box-shadow: 0 4px 15px rgba(0, 0, 0, 0.2);
					}
					.expanded {
						max-height: none;
					}
					@keyframes slideInDown {
						from {
							transform: translateY(-50px);
							opacity: 0;
						}
						to {
							transform: translateY(0);
							opacity: 1;
						}
					}
					@keyframes fadeInUp {
						from {
							transform: translateY(30px);
							opacity: 0;
						}
						to {
							transform: translateY(0);
							opacity: 1;
						}
					}
					@keyframes shimmer {
						0% { transform: translateX(-100%) translateY(-100%) rotate(45deg); }
						100% { transform: translateX(100%) translateY(100%) rotate(45deg); }
					}
					.file-content h1, .file-content h2, .file-content h3 {
						color: #333;
						margin: 15px 0 10px 0;
					}
					.file-content code {
						background: #f8f9fa;
						padding: 2px 6px;
						border-radius: 4px;
						font-family: 'Fira Code', 'Courier New', monospace;
						color: #e83e8c;
					}
					.file-content pre {
						background: #f8f9fa !important;
						padding: 15px;
						border-radius: 8px;
						overflow-x: auto;
						border-left: 4px solid #4ecdc4;
						margin: 10px 0;
						position: relative;
					}
					.file-content pre code {
						background: transparent !important;
						padding: 0;
						border-radius: 0;
						font-family: 'Fira Code', 'SF Mono', 'Monaco', 'Cascadia Code', 'Roboto Mono', 'Courier New', monospace;
						line-height: 1.5;
					}
					.file-content .hljs {
						background: #f8f9fa !important;
						color: #333 !important;
					}
					.file-content blockquote {
						border-left: 4px solid #4ecdc4;
						margin: 15px 0;
						padding: 10px 20px;
						background: rgba(78, 205, 196, 0.1);
						border-radius: 0 8px 8px 0;
						font-style: italic;
					}
					.file-content table {
						border-collapse: collapse;
						width: 100%;
						margin: 15px 0;
						border-radius: 8px;
						overflow: hidden;
						box-shadow: 0 2px 8px rgba(0,0,0,0.1);
					}
					.file-content table th,
					.file-content table td {
						border: 1px solid #e1e4e8;
						padding: 12px 16px;
						text-align: left;
					}
					.file-content table th {
						background: linear-gradient(45deg, #667eea, #764ba2);
						color: white;
						font-weight: 600;
					}
					.file-content table tbody tr:nth-child(even) {
						background: rgba(102, 126, 234, 0.05);
					}
					.file-content ul, .file-content ol {
						margin: 15px 0;
						padding-left: 30px;
					}
					.file-content li {
						margin: 8px 0;
						line-height: 1.6;
					}
					.file-content img {
						max-width: 100%;
						height: auto;
						border-radius: 8px;
						box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
						margin: 15px 0;
						display: block;
					}
				</style>
			</head>
			<body>
				<div id="root"></div>

				<script type="text/babel">
					const { useState, useEffect, useMemo } = React;

					// 配置 marked
					marked.setOptions({
						highlight: function(code, lang) {
							if (lang && hljs.getLanguage(lang)) {
								try {
									return hljs.highlight(code, { language: lang }).value;
								} catch (err) {
									console.warn('Highlight error:', err);
								}
							}
							return hljs.highlightAuto(code).value;
						},
						langPrefix: 'hljs language-',
						breaks: true,
						gfm: true
					});

					// 文件数据
					const filesData = ${JSON.stringify(processedFiles)};

					// Markdown 渲染组件
					const MarkdownRenderer = ({ content, truncate = false, maxLength = 1000 }) => {
						const [htmlContent, setHtmlContent] = useState('');

						useEffect(() => {
							if (content && content !== 'Error reading file content') {
								try {
									let contentToRender = content;
									if (truncate && content.length > maxLength) {
										// 智能截断：在完整段落处截断
										const truncated = content.substring(0, maxLength);
										const lastNewline = truncated.lastIndexOf('\\n\\n');
										contentToRender = lastNewline > maxLength * 0.7
											? truncated.substring(0, lastNewline) + '\\n\\n...'
											: truncated + '...';
									}

									const html = marked.parse(contentToRender);
									setHtmlContent(html);

									// 高亮代码块
									setTimeout(() => {
										document.querySelectorAll('pre code').forEach((block) => {
											if (!block.classList.contains('hljs')) {
												hljs.highlightElement(block);
											}
										});
									}, 100);
								} catch (error) {
									console.error('Markdown parsing error:', error);
									setHtmlContent(\`<p>Error parsing markdown: \${error.message}</p>\`);
								}
							} else {
								setHtmlContent('<p>Error reading file content</p>');
							}
						}, [content, truncate, maxLength]);

						return <div dangerouslySetInnerHTML={{ __html: htmlContent }} />;
					};

					// 文件卡片组件
					const FileCard = ({ file, index }) => {
						const [expanded, setExpanded] = useState(false);
						const [contentLoaded, setContentLoaded] = useState(false);

						useEffect(() => {
							// 分批加载动画
							setTimeout(() => setContentLoaded(true), index * 50);
						}, []);

						const shouldTruncate = file.rawContent && file.rawContent.length > 1000;

						return (
							<div
								className={\`file-card \${contentLoaded ? 'loaded' : ''} \${file.error ? 'error' : ''}\`}
								style={{
									animationDelay: \`\${index * 0.05}s\`,
									opacity: contentLoaded ? 1 : 0,
									transform: contentLoaded ? 'translateY(0)' : 'translateY(20px)'
								}}
							>
								<div className="file-header">
									<h2 className="file-title">{file.displayTitle}</h2>
									<div className="file-meta">
										<span className="file-path">{file.relativePath}</span>
										<span className="file-date">{new Date(file.birthtime).toLocaleDateString()}</span>
									</div>
								</div>
								<div className={\`file-content \${expanded ? 'expanded' : ''}\`}>
									<MarkdownRenderer
										content={file.rawContent}
										truncate={!expanded && shouldTruncate}
										maxLength={1000}
									/>
									{shouldTruncate && (
										<button
											className="expand-btn"
											onClick={() => setExpanded(!expanded)}
										>
											{expanded ? '📄 收起' : '📖 展开'}
										</button>
									)}
								</div>
							</div>
						);
					};

					// 主应用组件
					const App = () => {
						const [searchTerm, setSearchTerm] = useState('');
						const [sortBy, setSortBy] = useState('date');

						const filteredFiles = useMemo(() => {
							let filtered = filesData.filter(file =>
								file.displayTitle.toLowerCase().includes(searchTerm.toLowerCase()) ||
								file.relativePath.toLowerCase().includes(searchTerm.toLowerCase())
							);

							// 排序
							switch(sortBy) {
								case 'date':
									return filtered.sort((a, b) => new Date(b.birthtime) - new Date(a.birthtime));
								case 'name':
									return filtered.sort((a, b) => a.displayTitle.localeCompare(b.displayTitle));
								case 'path':
									return filtered.sort((a, b) => a.relativePath.localeCompare(b.relativePath));
								default:
									return filtered;
							}
						}, [searchTerm, sortBy]);

						return (
							<div className="app-container">
								<div className="header">
									<h1>📁 ${tagInfo.tag}</h1>
									<div className="file-count">{filteredFiles.length} / ${processedFiles.length} files</div>
								</div>

								<div className="search-container">
									<input
										type="text"
										className="search-input"
										placeholder="🔍 搜索文件..."
										value={searchTerm}
										onChange={(e) => setSearchTerm(e.target.value)}
									/>
								</div>

								<div style={{
									marginBottom: '20px',
									textAlign: 'center'
								}}>
									<select
										value={sortBy}
										onChange={(e) => setSortBy(e.target.value)}
										style={{
											padding: '8px 16px',
											borderRadius: '20px',
											border: 'none',
											background: 'rgba(255,255,255,0.9)',
											cursor: 'pointer'
										}}
									>
										<option value="date">按日期排序</option>
										<option value="name">按标题排序</option>
										<option value="path">按路径排序</option>
									</select>
								</div>

								<div className="files-grid">
									{filteredFiles.map((file, index) => (
										<FileCard key={file.path} file={file} index={index} />
									))}
								</div>

								{filteredFiles.length === 0 && (
									<div style={{
										textAlign: 'center',
										padding: '50px',
										color: 'rgba(255,255,255,0.8)',
										fontSize: '1.2em'
									}}>
										🔍 没有找到匹配的文件
									</div>
								)}
							</div>
						);
					};

					// 渲染应用
					ReactDOM.render(<App />, document.getElementById('root'));
				</script>
			</body>
			</html>
		`;

		tagFilesPanel.webview.html = html;

	} catch (error) {
		console.error('Error showing tag files:', error);
		vscode.window.showErrorMessage('Failed to show tag files');
	}
}



// This method is called when your extension is deactivated
export function deactivate() {}
