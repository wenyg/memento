// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';

interface MdFileInfo {
	path: string;
	birthtime: Date;
	relativePath: string;
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
		super(fileInfo.relativePath, collapsibleState);
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
			isFile && fileInfo ? fileInfo.relativePath : tagInfo.tag,
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

	context.subscriptions.push(switchToFileViewDisposable);
	context.subscriptions.push(switchToTagViewDisposable);
	context.subscriptions.push(refreshDisposable);
}

async function findMarkdownFiles(dir: string): Promise<Array<{path: string, birthtime: Date, relativePath: string}>> {
	const mdFiles: Array<{path: string, birthtime: Date, relativePath: string}> = [];

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
				mdFiles.push({
					path: itemPath,
					birthtime: stats.birthtime,
					relativePath: relativePath
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
				const tags = await extractTagsFromFile(itemPath);
				mdFiles.push({
					path: itemPath,
					birthtime: stats.birthtime,
					relativePath: relativePath,
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



// This method is called when your extension is deactivated
export function deactivate() {}
