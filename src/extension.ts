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

			// Handle messages from the webview
			tagFilesPanel.webview.onDidReceiveMessage(
				async (message) => {
					switch (message.command) {
						case 'editFile':
							try {
								const fileUri = vscode.Uri.file(message.path);
								// 在主编辑器区域打开文件，不影响侧边栏的查看窗口
								await vscode.window.showTextDocument(fileUri, {
									viewColumn: vscode.ViewColumn.One, // 在主编辑器区域打开
									preserveFocus: false, // 获得焦点，方便编辑
									preview: false // 不使用预览模式，确保文件保持打开状态
								});
							} catch (error) {
								console.error('Error opening file:', error);
								vscode.window.showErrorMessage(`Failed to open file: ${message.path}`);
							}
							break;
					}
				}
			);
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
					body {
						font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
						background: white;
						margin: 0;
						padding: 20px;
						color: #333;
						line-height: 1.6;
					}
					.container {
						max-width: 800px;
						margin: 0 auto;
					}
					.header {
						margin-bottom: 30px;
						text-align: center;
					}
					.header h1 {
						margin: 0;
						font-size: 2em;
						color: #333;
					}
					.file-count {
						color: #666;
						margin-top: 10px;
					}
					.file-separator {
						border: none;
						border-top: 1px solid #ccc;
						margin: 40px 0;
					}
					.file-header {
						display: flex;
						justify-content: space-between;
						align-items: center;
						margin: 20px 0 10px 0;
					}
					.file-title {
						font-size: 1.5em;
						font-weight: 600;
						color: #333;
						margin: 0;
					}
					.edit-btn {
						background: #007acc;
						color: white;
						border: none;
						padding: 6px 12px;
						border-radius: 4px;
						cursor: pointer;
						font-size: 0.8em;
						font-weight: 500;
						transition: background-color 0.2s;
					}
					.edit-btn:hover {
						background: #005a9e;
					}
					.file-meta {
						color: #666;
						font-size: 0.9em;
						margin-bottom: 20px;
						font-family: monospace;
					}
					.markdown-content {
						margin-bottom: 20px;
					}
					.markdown-content h1, .markdown-content h2, .markdown-content h3 {
						margin-top: 20px;
						margin-bottom: 10px;
					}
					.markdown-content pre {
						background: #f8f9fa;
						padding: 15px;
						border-radius: 5px;
						overflow-x: auto;
					}
					.markdown-content code {
						background: #f8f9fa;
						padding: 2px 4px;
						border-radius: 3px;
						font-family: 'Monaco', 'Menlo', 'Ubuntu Mono', monospace;
					}
					.markdown-content pre code {
						background: transparent;
						padding: 0;
					}
					.markdown-content blockquote {
						border-left: 4px solid #ddd;
						margin: 0;
						padding: 0 15px;
						color: #666;
					}
					.markdown-content table {
						border-collapse: collapse;
						width: 100%;
						margin: 15px 0;
					}
					.markdown-content table th,
					.markdown-content table td {
						border: 1px solid #ddd;
						padding: 8px 12px;
						text-align: left;
					}
					.markdown-content table th {
						background: #f8f9fa;
						font-weight: 600;
					}
				</style>
			</head>
			<body>
				<div id="root"></div>

				<script type="text/babel">
					const { useState, useEffect } = React;

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
					const MarkdownRenderer = ({ content }) => {
						const [htmlContent, setHtmlContent] = useState('');

						useEffect(() => {
							if (content && content !== 'Error reading file content') {
								try {
									const html = marked.parse(content);
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
						}, [content]);

						return <div className="markdown-content" dangerouslySetInnerHTML={{ __html: htmlContent }} />;
					};

					// 编辑函数
					const handleEditFile = (filePath) => {
						// 通过 VSCode API 打开文件编辑器
						if (window.acquireVsCodeApi) {
							const vscode = window.acquireVsCodeApi();
							vscode.postMessage({
								command: 'editFile',
								path: filePath
							});
						}
					};

					// 主应用组件
					const App = () => {
						return (
							<div className="container">
								<div className="header">
									<h1>${tagInfo.tag}</h1>
									<div className="file-count">{filesData.length} files</div>
								</div>

								{filesData.map((file, index) => (
									<div key={file.path}>
										{index > 0 && <hr className="file-separator" />}
										<div className="file-header">
											<div className="file-title">{file.displayTitle}</div>
											<button
												className="edit-btn"
												onClick={() => handleEditFile(file.path)}
												title="在编辑器中打开此文件"
											>
												✏️ 编辑
											</button>
										</div>
										<div className="file-meta">
											{file.relativePath} • {new Date(file.birthtime).toLocaleDateString()}
										</div>
										<MarkdownRenderer content={file.rawContent} />
									</div>
								))}
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
