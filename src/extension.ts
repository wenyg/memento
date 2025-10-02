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

interface FrontMatter {
	title?: string;
	date?: string;
	tags?: string[];
	[key: string]: any;
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
		try {
			const rootPath = await getNotesRootPath();
			if (!rootPath) {
				console.log('MdFilesProvider: No notes path available');
				this.mdFiles = [];
				return;
			}

			console.log('MdFilesProvider: Searching in:', rootPath);
			const mdFiles = await findMarkdownFiles(rootPath);
			console.log('MdFilesProvider: Found files:', mdFiles.length);

			// Sort by creation time (newest first)
			this.mdFiles = mdFiles.sort((a, b) => b.birthtime.getTime() - a.birthtime.getTime());
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
		try {
			const rootPath = await getNotesRootPath();
			if (!rootPath) {
				console.log('TagTreeProvider: No notes path available');
				this.mdFiles = [];
				return;
			}

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
		const rootTags = new Set<string>();

		// Process all files and their tags
		for (const file of this.mdFiles) {
			if (!file.tags || file.tags.length === 0) {
				continue;
			}

			for (const tag of file.tags) {
				this.addTagToTree(tag, file, tagMap, rootTags);
			}
		}

		// Convert map to tree structure - only get root level tags
		this.tagTree = Array.from(rootTags).map(rootTag => tagMap.get(rootTag)!);

		// Sort tags alphabetically
		this.sortTagTree(this.tagTree);
	}

	private addTagToTree(tag: string, file: MdFileInfo, tagMap: Map<string, TagInfo>, rootTags: Set<string>): void {
		const parts = tag.split('/');
		let currentPath = '';

		for (let i = 0; i < parts.length; i++) {
			const part = parts[i];
			const parentPath = currentPath;
			currentPath = currentPath ? `${currentPath}/${part}` : part;

			// Track root level tags
			if (i === 0) {
				rootTags.add(currentPath);
			}

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
				const childTagInfo = tagMap.get(currentPath)!;
				if (!parentTagInfo.children!.some(child => child === childTagInfo)) {
					parentTagInfo.children!.push(childTagInfo);
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

async function getNotesRootPath(): Promise<string | null> {
	const config = vscode.workspace.getConfiguration('memento');
	const configuredPath: string = config.get('notesPath', '');

	// If user configured a notes path, use it
	if (configuredPath) {
		// Check if the path exists
		try {
			const stats = await fs.promises.stat(configuredPath);
			if (stats.isDirectory()) {
				// Check if this path is in any workspace folder
				await checkAndSuggestAddToWorkspace(configuredPath);
				return configuredPath;
			} else {
				vscode.window.showErrorMessage(`配置的笔记路径不是一个有效的目录: ${configuredPath}`);
				return null;
			}
		} catch (error) {
			vscode.window.showErrorMessage(`配置的笔记路径不存在: ${configuredPath}`);
			return null;
		}
	}

	// Otherwise, use the first workspace folder
	const workspaceFolders = vscode.workspace.workspaceFolders;
	if (!workspaceFolders || workspaceFolders.length === 0) {
		return null;
	}

	return workspaceFolders[0].uri.fsPath;
}

async function checkAndSuggestAddToWorkspace(notesPath: string): Promise<void> {
	const workspaceFolders = vscode.workspace.workspaceFolders;

	// Check if notes path is already in workspace
	if (workspaceFolders) {
		for (const folder of workspaceFolders) {
			if (folder.uri.fsPath === notesPath) {
				return; // Already in workspace
			}
		}
	}

	// Not in workspace, suggest adding it
	const answer = await vscode.window.showInformationMessage(
		`笔记目录 "${notesPath}" 不在当前工作区中。添加到工作区可以使用 VSCode 的查找和文件管理功能。`,
		'添加到工作区',
		'暂不添加'
	);

	if (answer === '添加到工作区') {
		const folderUri = vscode.Uri.file(notesPath);
		const workspaceFolder: vscode.WorkspaceFolder = {
			uri: folderUri,
			name: path.basename(notesPath),
			index: workspaceFolders ? workspaceFolders.length : 0
		};

		vscode.workspace.updateWorkspaceFolders(
			workspaceFolders ? workspaceFolders.length : 0,
			0,
			workspaceFolder
		);
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

	const revealInExplorerDisposable = vscode.commands.registerCommand('memento.revealInExplorer', (item: MdFileItem | TagItem) => {
		console.log('Reveal in explorer command triggered');
		let filePath: string | undefined;

		if (item instanceof MdFileItem) {
			filePath = item.fileInfo.path;
		} else if (item instanceof TagItem && item.isFile && item.fileInfo) {
			filePath = item.fileInfo.path;
		}

		if (filePath) {
			const uri = vscode.Uri.file(filePath);
			vscode.commands.executeCommand('revealInExplorer', uri);
		}
	});

	const fillFrontMatterDateDisposable = vscode.commands.registerCommand('memento.fillFrontMatterDate', async () => {
		console.log('Fill Front Matter Date command triggered');
		const notesPath = await getNotesRootPath();
		if (!notesPath) {
			vscode.window.showErrorMessage('未找到笔记目录');
			return;
		}

		await fillFrontMatterDateForAllFiles(notesPath);
		vscode.window.showInformationMessage('Front Matter Date 字段填充完成');
		mainProvider.refresh();
	});

	context.subscriptions.push(switchToFileViewDisposable);
	context.subscriptions.push(switchToTagViewDisposable);
	context.subscriptions.push(refreshDisposable);
	context.subscriptions.push(revealInExplorerDisposable);
	context.subscriptions.push(fillFrontMatterDateDisposable);
}

function shouldExcludeFolder(folderName: string): boolean {
	const config = vscode.workspace.getConfiguration('memento');
	const excludeFolders: string[] = config.get('excludeFolders', ['node_modules', '.git']);

	// Check if folder starts with dot (hidden folders)
	if (folderName.startsWith('.')) {
		return true;
	}

	// Check against exclude list (supports simple wildcard matching)
	for (const pattern of excludeFolders) {
		if (pattern.includes('*')) {
			// Simple wildcard matching
			const regexPattern = pattern.replace(/\*/g, '.*');
			const regex = new RegExp(`^${regexPattern}$`);
			if (regex.test(folderName)) {
				return true;
			}
		} else {
			// Exact match
			if (folderName === pattern) {
				return true;
			}
		}
	}

	return false;
}

async function findMarkdownFiles(dir: string): Promise<Array<{path: string, birthtime: Date, relativePath: string, displayTitle: string}>> {
	const mdFiles: Array<{path: string, birthtime: Date, relativePath: string, displayTitle: string}> = [];

	async function scanDirectory(currentDir: string, rootDir: string) {
		const items = await fs.promises.readdir(currentDir);

		for (const item of items) {
			const itemPath = path.join(currentDir, item);
			const stats = await fs.promises.stat(itemPath);

			if (stats.isDirectory()) {
				// Skip excluded directories
				if (!shouldExcludeFolder(item)) {
					await scanDirectory(itemPath, rootDir);
				}
			} else if (stats.isFile() && path.extname(item).toLowerCase() === '.md') {
				const relativePath = path.relative(rootDir, itemPath);
				const displayTitle = await extractFirstHeading(itemPath);

				// Try to get date from Front Matter
				let birthtime = stats.birthtime;
				try {
					const content = await fs.promises.readFile(itemPath, 'utf-8');
					const frontMatter = parseFrontMatter(content);
					if (frontMatter && frontMatter.date) {
						const parsedDate = new Date(frontMatter.date);
						if (!isNaN(parsedDate.getTime())) {
							birthtime = parsedDate;
						}
					}
				} catch (error) {
					// Use file birthtime if Front Matter parsing fails
				}

				mdFiles.push({
					path: itemPath,
					birthtime: birthtime,
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
				// Skip excluded directories
				if (!shouldExcludeFolder(item)) {
					await scanDirectory(itemPath, rootDir);
				}
			} else if (stats.isFile() && path.extname(item).toLowerCase() === '.md') {
				const relativePath = path.relative(rootDir, itemPath);
				const displayTitle = await extractFirstHeading(itemPath);
				const tags = await extractTagsFromFile(itemPath);

				// Try to get date from Front Matter
				let birthtime = stats.birthtime;
				try {
					const content = await fs.promises.readFile(itemPath, 'utf-8');
					const frontMatter = parseFrontMatter(content);
					if (frontMatter && frontMatter.date) {
						const parsedDate = new Date(frontMatter.date);
						if (!isNaN(parsedDate.getTime())) {
							birthtime = parsedDate;
						}
					}
				} catch (error) {
					// Use file birthtime if Front Matter parsing fails
				}

				mdFiles.push({
					path: itemPath,
					birthtime: birthtime,
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

function parseFrontMatter(content: string): FrontMatter | null {
	if (!content.startsWith('---\n') && !content.startsWith('---\r\n')) {
		return null;
	}

	const endMatch = content.match(/\n---\n|\r\n---\r\n|\n---\r\n|\r\n---\n/);
	if (!endMatch || !endMatch.index) {
		return null;
	}

	const frontMatterContent = content.substring(4, endMatch.index);
	const frontMatter: FrontMatter = {};

	// Simple YAML parser for common fields
	const lines = frontMatterContent.split(/\r?\n/);
	let i = 0;
	while (i < lines.length) {
		const line = lines[i];
		const match = line.match(/^(\w+):\s*(.*)$/);
		if (match) {
			const key = match[1];
			let value: any = match[2].trim();

			// Handle inline array format: tags: [tag1, tag2]
			if (value.startsWith('[') && value.endsWith(']')) {
				value = value.slice(1, -1).split(',').map((v: string) => v.trim().replace(/['"]/g, ''));
				frontMatter[key] = value;
				i++;
				continue;
			}

			// Handle multi-line array format:
			// tags:
			//   - tag1
			//   - tag2
			if (value === '' || value === '[]') {
				const arrayItems: string[] = [];
				i++;
				while (i < lines.length) {
					const nextLine = lines[i];
					const arrayMatch = nextLine.match(/^\s*-\s*(.+)$/);
					if (arrayMatch) {
						let item = arrayMatch[1].trim();
						// Remove quotes if present
						if ((item.startsWith('"') && item.endsWith('"')) ||
						    (item.startsWith("'") && item.endsWith("'"))) {
							item = item.slice(1, -1);
						}
						arrayItems.push(item);
						i++;
					} else if (nextLine.trim() === '') {
						// Skip empty lines
						i++;
					} else {
						// End of array
						break;
					}
				}
				if (arrayItems.length > 0) {
					frontMatter[key] = arrayItems;
				}
				continue;
			}

			// Remove quotes if present
			if ((value.startsWith('"') && value.endsWith('"')) ||
			    (value.startsWith("'") && value.endsWith("'"))) {
				value = value.slice(1, -1);
			}

			frontMatter[key] = value;
		}
		i++;
	}

	return frontMatter;
}

function removeCodeBlocks(content: string): string {
	// Remove fenced code blocks (```...```)
	let result = content.replace(/```[\s\S]*?```/g, '');

	// Remove inline code (`...`)
	result = result.replace(/`[^`]+`/g, '');

	return result;
}

async function extractTagsFromFile(filePath: string): Promise<string[]> {
	try {
		const content = await fs.promises.readFile(filePath, 'utf-8');
		const tags: string[] = [];

		// First, try to get tags from Front Matter
		const frontMatter = parseFrontMatter(content);
		if (frontMatter && frontMatter.tags) {
			if (Array.isArray(frontMatter.tags)) {
				tags.push(...frontMatter.tags);
			} else if (typeof frontMatter.tags === 'string') {
				tags.push(frontMatter.tags);
			}
		}

		// Remove code blocks to avoid matching tags in code
		const contentWithoutCode = removeCodeBlocks(content);

		// Match #tag or #level1/level2 patterns, supporting Chinese characters
		// \p{L} matches any Unicode letter (including Chinese), \p{N} matches any Unicode number
		const tagRegex = /#([\p{L}\p{N}_\-\/]+)/gu;
		let match;

		while ((match = tagRegex.exec(contentWithoutCode)) !== null) {
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

		// First, try to get title from Front Matter
		const frontMatter = parseFrontMatter(content);
		if (frontMatter && frontMatter.title) {
			return frontMatter.title;
		}

		// Remove code blocks to avoid matching headings in code
		const contentWithoutCode = removeCodeBlocks(content);

		// Match first level 1 heading (# title)
		const headingMatch = contentWithoutCode.match(/^#\s+(.+)$/m);
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

async function fillFrontMatterDateForAllFiles(dir: string): Promise<void> {
	const mdFiles: string[] = [];

	async function scanDirectory(currentDir: string) {
		const items = await fs.promises.readdir(currentDir);

		for (const item of items) {
			const itemPath = path.join(currentDir, item);
			const stats = await fs.promises.stat(itemPath);

			if (stats.isDirectory()) {
				if (!shouldExcludeFolder(item)) {
					await scanDirectory(itemPath);
				}
			} else if (stats.isFile() && path.extname(item).toLowerCase() === '.md') {
				mdFiles.push(itemPath);
			}
		}
	}

	await scanDirectory(dir);

	let processedCount = 0;
	for (const filePath of mdFiles) {
		const updated = await fillFrontMatterDateForFile(filePath);
		if (updated) {
			processedCount++;
		}
	}

	console.log(`Processed ${processedCount} files`);
}

async function fillFrontMatterDateForFile(filePath: string): Promise<boolean> {
	try {
		const content = await fs.promises.readFile(filePath, 'utf-8');
		const stats = await fs.promises.stat(filePath);

		// Check if file already has front matter
		const hasFrontMatter = content.startsWith('---\n');

		let newContent: string;

		if (hasFrontMatter) {
			// Parse existing front matter
			const endOfFrontMatter = content.indexOf('\n---\n', 4);
			if (endOfFrontMatter === -1) {
				return false; // Invalid front matter
			}

			const frontMatterContent = content.substring(4, endOfFrontMatter);
			const restContent = content.substring(endOfFrontMatter + 5);

			// Check if date field already exists
			if (frontMatterContent.match(/^date:/m)) {
				return false; // Already has date field
			}

			// Add date field
			const dateStr = stats.birthtime.toISOString().split('T')[0];
			newContent = `---\n${frontMatterContent}\ndate: ${dateStr}\n---\n${restContent}`;
		} else {
			// Create new front matter
			const dateStr = stats.birthtime.toISOString().split('T')[0];
			newContent = `---\ndate: ${dateStr}\n---\n\n${content}`;
		}

		await fs.promises.writeFile(filePath, newContent, 'utf-8');
		return true;
	} catch (error) {
		console.error(`Error processing file ${filePath}:`, error);
		return false;
	}
}

// This method is called when your extension is deactivated
export function deactivate() {}
