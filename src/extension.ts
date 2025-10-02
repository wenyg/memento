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

interface MementoConfig {
	excludeFolders: string[];
	dailyNotesPath: string;
	dailyNoteFileNameFormat: string;
	dailyNoteTemplatePath: string;
	weeklyNotesPath: string;
	weeklyNoteFileNameFormat: string;
	weeklyNoteTemplatePath: string;
}

const DEFAULT_CONFIG: MementoConfig = {
	excludeFolders: ['node_modules', '.git'],
	dailyNotesPath: 'daily',
	dailyNoteFileNameFormat: '{{year}}-{{month}}-{{day}}.md',
	dailyNoteTemplatePath: '',
	weeklyNotesPath: 'weekly',
	weeklyNoteFileNameFormat: '{{year}}-W{{week}}.md',
	weeklyNoteTemplatePath: ''
};

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

class CalendarItem extends vscode.TreeItem {
	constructor(
		public readonly label: string,
		public readonly collapsibleState: vscode.TreeItemCollapsibleState,
		public readonly itemType: 'daily' | 'weekly' | 'action' | 'file' | 'category',
		public readonly action?: () => void,
		public readonly filePath?: string
	) {
		super(label, collapsibleState);

		if (itemType === 'action') {
			this.contextValue = 'calendarAction';
			this.iconPath = new vscode.ThemeIcon('edit');
			this.command = {
				command: 'memento.executeCalendarAction',
				title: label,
				arguments: [this]
			};
		} else if (itemType === 'file') {
			this.contextValue = 'calendarFile';
			this.iconPath = new vscode.ThemeIcon('markdown');
			if (filePath) {
				this.resourceUri = vscode.Uri.file(filePath);
				this.command = {
					command: 'vscode.open',
					title: 'Open',
					arguments: [this.resourceUri]
				};
			}
		} else {
			this.contextValue = 'calendarCategory';
			this.iconPath = new vscode.ThemeIcon(itemType === 'daily' ? 'calendar' : 'notebook');
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

class CalendarProvider implements vscode.TreeDataProvider<CalendarItem> {
	private _onDidChangeTreeData: vscode.EventEmitter<CalendarItem | undefined | null | void> = new vscode.EventEmitter<CalendarItem | undefined | null | void>();
	readonly onDidChangeTreeData: vscode.Event<CalendarItem | undefined | null | void> = this._onDidChangeTreeData.event;

	refresh(): void {
		this._onDidChangeTreeData.fire();
	}

	getTreeItem(element: CalendarItem): vscode.TreeItem {
		return element;
	}

	async getChildren(element?: CalendarItem): Promise<CalendarItem[]> {
		if (!element) {
			// Root level - show Daily and Weekly categories
			return [
				new CalendarItem('Daily Notes', vscode.TreeItemCollapsibleState.Expanded, 'daily'),
				new CalendarItem('Weekly Notes', vscode.TreeItemCollapsibleState.Expanded, 'weekly')
			];
		} else {
			// Show action button and recent files
			if (element.itemType === 'daily') {
				const items: CalendarItem[] = [
					new CalendarItem('📝 打开今天的日记', vscode.TreeItemCollapsibleState.None, 'action', () => {
						vscode.commands.executeCommand('memento.openDailyNote');
					})
				];

				// Load recent daily notes
				const recentFiles = await this.loadRecentPeriodicNotes('daily', 10);
				items.push(...recentFiles);

				return items;
			} else if (element.itemType === 'weekly') {
				const items: CalendarItem[] = [
					new CalendarItem('📊 打开本周的周报', vscode.TreeItemCollapsibleState.None, 'action', () => {
						vscode.commands.executeCommand('memento.openWeeklyNote');
					})
				];

				// Load recent weekly notes
				const recentFiles = await this.loadRecentPeriodicNotes('weekly', 10);
				items.push(...recentFiles);

				return items;
			}
		}

		return [];
	}

	private async loadRecentPeriodicNotes(type: 'daily' | 'weekly', limit: number): Promise<CalendarItem[]> {
		const notesPath = await getNotesRootPath();
		if (!notesPath) {
			return [];
		}

		const config = await loadMementoConfig(notesPath);
		let noteDir: string;

		if (type === 'daily') {
			const customPath: string = config.dailyNotesPath;
			noteDir = path.isAbsolute(customPath) ? customPath : path.join(notesPath, customPath);
		} else {
			const customPath: string = config.weeklyNotesPath;
			noteDir = path.isAbsolute(customPath) ? customPath : path.join(notesPath, customPath);
		}

		// Check if directory exists
		try {
			await fs.promises.access(noteDir);
		} catch {
			return [];
		}

		// Read all files in the directory
		try {
			const files = await fs.promises.readdir(noteDir);
			const mdFiles = files.filter(f => f.endsWith('.md'));

			// Filter files based on naming pattern
			const fileNamePattern = type === 'daily' ? config.dailyNoteFileNameFormat : config.weeklyNoteFileNameFormat;
			const regexPattern = fileNamePattern
				.replace(/\{\{year\}\}/g, '(\\d{4})')
				.replace(/\{\{month\}\}/g, '(\\d{2})')
				.replace(/\{\{day\}\}/g, '(\\d{2})')
				.replace(/\{\{week\}\}/g, '(\\d{2})')
				.replace(/\./g, '\\.');
			const regex = new RegExp(`^${regexPattern}$`);

			const fileStats = mdFiles
				.map(fileName => {
					const match = fileName.match(regex);
					if (!match) {
						return null;
					}

					const filePath = path.join(noteDir, fileName);
					let sortKey: string;

					if (type === 'daily') {
						// Extract year, month, day from filename based on pattern
						const yearIndex = fileNamePattern.indexOf('{{year}}');
						const monthIndex = fileNamePattern.indexOf('{{month}}');
						const dayIndex = fileNamePattern.indexOf('{{day}}');

						const positions = [
							{ index: yearIndex, groupIndex: 1 },
							{ index: monthIndex, groupIndex: 2 },
							{ index: dayIndex, groupIndex: 3 }
						].sort((a, b) => a.index - b.index);

						const year = match[positions.findIndex(p => p.index === yearIndex) + 1];
						const month = match[positions.findIndex(p => p.index === monthIndex) + 1];
						const day = match[positions.findIndex(p => p.index === dayIndex) + 1];

						sortKey = `${year}${month}${day}`;
					} else {
						// Extract year and week from filename based on pattern
						const yearIndex = fileNamePattern.indexOf('{{year}}');
						const weekIndex = fileNamePattern.indexOf('{{week}}');

						const positions = [
							{ index: yearIndex, groupIndex: 1 },
							{ index: weekIndex, groupIndex: 2 }
						].sort((a, b) => a.index - b.index);

						const year = match[positions.findIndex(p => p.index === yearIndex) + 1];
						const week = match[positions.findIndex(p => p.index === weekIndex) + 1];

						sortKey = `${year}${week}`;
					}

					return {
						fileName,
						filePath,
						sortKey
					};
				})
				.filter((f): f is { fileName: string; filePath: string; sortKey: string } => f !== null);

			// Sort by date (newest first)
			fileStats.sort((a, b) => b.sortKey.localeCompare(a.sortKey));

			// Return the most recent files
			return fileStats.slice(0, limit).map(file => {
				const displayName = file.fileName.replace('.md', '');
				return new CalendarItem(
					displayName,
					vscode.TreeItemCollapsibleState.None,
					'file',
					undefined,
					file.filePath
				);
			});
		} catch (error) {
			console.error(`Error loading ${type} notes:`, error);
			return [];
		}
	}
}

enum ViewMode {
	FILES = 'files',
	TAGS = 'tags',
	CALENDAR = 'calendar',
	SETTINGS = 'settings'
}

class MainTreeProvider implements vscode.TreeDataProvider<MdFileItem | TagItem | CalendarItem> {
	private _onDidChangeTreeData: vscode.EventEmitter<MdFileItem | TagItem | CalendarItem | undefined | null | void> = new vscode.EventEmitter<MdFileItem | TagItem | CalendarItem | undefined | null | void>();
	readonly onDidChangeTreeData: vscode.Event<MdFileItem | TagItem | CalendarItem | undefined | null | void> = this._onDidChangeTreeData.event;

	private currentMode: ViewMode = ViewMode.FILES;
	private fileProvider: MdFilesProvider;
	private tagProvider: TagTreeProvider;
	private calendarProvider: CalendarProvider;

	constructor() {
		this.fileProvider = new MdFilesProvider();
		this.tagProvider = new TagTreeProvider();
		this.calendarProvider = new CalendarProvider();

		// Listen to changes from all providers
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

		this.calendarProvider.onDidChangeTreeData(() => {
			if (this.currentMode === ViewMode.CALENDAR) {
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

	switchToCalendarView(): void {
		this.currentMode = ViewMode.CALENDAR;
		this._onDidChangeTreeData.fire();
	}

	switchToSettingsView(): void {
		this.currentMode = ViewMode.SETTINGS;
		this._onDidChangeTreeData.fire();
	}

	refresh(): void {
		if (this.currentMode === ViewMode.FILES) {
			this.fileProvider.refresh();
		} else if (this.currentMode === ViewMode.TAGS) {
			this.tagProvider.refresh();
		} else {
			this.calendarProvider.refresh();
		}
	}

	getTreeItem(element: MdFileItem | TagItem | CalendarItem): vscode.TreeItem {
		return element;
	}

	getChildren(element?: MdFileItem | TagItem | CalendarItem): Thenable<(MdFileItem | TagItem | CalendarItem)[]> {
		if (this.currentMode === ViewMode.FILES) {
			return this.fileProvider.getChildren(element as MdFileItem);
		} else if (this.currentMode === ViewMode.TAGS) {
			return this.tagProvider.getChildren(element as TagItem);
		} else if (this.currentMode === ViewMode.CALENDAR) {
			return this.calendarProvider.getChildren(element as CalendarItem);
		} else {
			// SETTINGS mode
			return this.getSettingsItems(element as CalendarItem);
		}
	}

	private async getSettingsItems(element?: CalendarItem): Promise<CalendarItem[]> {
		const notesPath = await getNotesRootPath();
		if (!notesPath) {
			return [];
		}

		const config = await loadMementoConfig(notesPath);

		// Root level - show categories
		if (!element) {
			const currentNotesPath = notesPath || '(使用当前工作区)';
			return [
				new CalendarItem(`📂 笔记根目录: ${currentNotesPath}`, vscode.TreeItemCollapsibleState.Collapsed, 'category'),
				new CalendarItem('📁 文件过滤', vscode.TreeItemCollapsibleState.Collapsed, 'category'),
				new CalendarItem('📝 日记设置', vscode.TreeItemCollapsibleState.Collapsed, 'category'),
				new CalendarItem('📊 周报设置', vscode.TreeItemCollapsibleState.Collapsed, 'category'),
				new CalendarItem('🔧 工具', vscode.TreeItemCollapsibleState.Collapsed, 'category')
			];
		}

		// Category level - show settings
		if (element.label.startsWith('📂 笔记根目录:')) {
			const vscodeConfig = vscode.workspace.getConfiguration('memento');
			const configuredPath: string = vscodeConfig.get('notesPath', '');

			return [
				new CalendarItem(
					'打开 VSCode 设置',
					vscode.TreeItemCollapsibleState.None,
					'action',
					() => {
						vscode.commands.executeCommand('workbench.action.openSettings', 'memento.notesPath');
					}
				),
				new CalendarItem(
					configuredPath ? `当前路径: ${configuredPath}` : '提示: 在 VSCode 设置中搜索 "memento.notesPath" 进行配置',
					vscode.TreeItemCollapsibleState.None,
					'category'
				)
			];
		}

		if (element.label === '📁 文件过滤') {
			return [
				new CalendarItem(
					`排除文件夹: ${config.excludeFolders.join(', ')}`,
					vscode.TreeItemCollapsibleState.None,
					'action',
					async () => {
						const input = await vscode.window.showInputBox({
							prompt: '输入要排除的文件夹（逗号分隔）',
							value: config.excludeFolders.join(', '),
							placeHolder: '例如: node_modules, .git, temp*'
						});
						if (input !== undefined) {
							const newConfig = { ...config, excludeFolders: input.split(',').map(s => s.trim()).filter(s => s) };
							await saveMementoConfig(notesPath, newConfig);
							vscode.window.showInformationMessage('排除文件夹设置已更新');
							this.refresh();
						}
					}
				)
			];
		}

		if (element.label === '📝 日记设置') {
			return [
				new CalendarItem(
					`存储路径: ${config.dailyNotesPath}`,
					vscode.TreeItemCollapsibleState.None,
					'action',
					async () => {
						const input = await vscode.window.showInputBox({
							prompt: '输入日记存储路径',
							value: config.dailyNotesPath,
							placeHolder: '相对路径或绝对路径'
						});
						if (input !== undefined) {
							const newConfig = { ...config, dailyNotesPath: input };
							await saveMementoConfig(notesPath, newConfig);
							vscode.window.showInformationMessage('日记路径已更新');
							this.refresh();
						}
					}
				),
				new CalendarItem(
					`文件名格式: ${config.dailyNoteFileNameFormat}`,
					vscode.TreeItemCollapsibleState.None,
					'action',
					async () => {
						const input = await vscode.window.showInputBox({
							prompt: '输入日记文件名格式',
							value: config.dailyNoteFileNameFormat,
							placeHolder: '支持变量: {{year}}, {{month}}, {{day}}, {{week}}, {{title}}, {{date}}'
						});
						if (input !== undefined) {
							const newConfig = { ...config, dailyNoteFileNameFormat: input };
							await saveMementoConfig(notesPath, newConfig);
							vscode.window.showInformationMessage('日记文件名格式已更新');
							this.refresh();
						}
					}
				),
				new CalendarItem(
					`模板路径: ${config.dailyNoteTemplatePath || '(使用默认模板)'}`,
					vscode.TreeItemCollapsibleState.None,
					'action',
					async () => {
						const input = await vscode.window.showInputBox({
							prompt: '输入日记模板文件路径',
							value: config.dailyNoteTemplatePath,
							placeHolder: '相对路径或绝对路径，留空使用默认模板'
						});
						if (input !== undefined) {
							const newConfig = { ...config, dailyNoteTemplatePath: input };
							await saveMementoConfig(notesPath, newConfig);
							vscode.window.showInformationMessage('日记模板路径已更新');
							this.refresh();
						}
					}
				)
			];
		}

		if (element.label === '📊 周报设置') {
			return [
				new CalendarItem(
					`存储路径: ${config.weeklyNotesPath}`,
					vscode.TreeItemCollapsibleState.None,
					'action',
					async () => {
						const input = await vscode.window.showInputBox({
							prompt: '输入周报存储路径',
							value: config.weeklyNotesPath,
							placeHolder: '相对路径或绝对路径'
						});
						if (input !== undefined) {
							const newConfig = { ...config, weeklyNotesPath: input };
							await saveMementoConfig(notesPath, newConfig);
							vscode.window.showInformationMessage('周报路径已更新');
							this.refresh();
						}
					}
				),
				new CalendarItem(
					`文件名格式: ${config.weeklyNoteFileNameFormat}`,
					vscode.TreeItemCollapsibleState.None,
					'action',
					async () => {
						const input = await vscode.window.showInputBox({
							prompt: '输入周报文件名格式',
							value: config.weeklyNoteFileNameFormat,
							placeHolder: '支持变量: {{year}}, {{month}}, {{day}}, {{week}}, {{title}}, {{date}}'
						});
						if (input !== undefined) {
							const newConfig = { ...config, weeklyNoteFileNameFormat: input };
							await saveMementoConfig(notesPath, newConfig);
							vscode.window.showInformationMessage('周报文件名格式已更新');
							this.refresh();
						}
					}
				),
				new CalendarItem(
					`模板路径: ${config.weeklyNoteTemplatePath || '(使用默认模板)'}`,
					vscode.TreeItemCollapsibleState.None,
					'action',
					async () => {
						const input = await vscode.window.showInputBox({
							prompt: '输入周报模板文件路径',
							value: config.weeklyNoteTemplatePath,
							placeHolder: '相对路径或绝对路径，留空使用默认模板'
						});
						if (input !== undefined) {
							const newConfig = { ...config, weeklyNoteTemplatePath: input };
							await saveMementoConfig(notesPath, newConfig);
							vscode.window.showInformationMessage('周报模板路径已更新');
							this.refresh();
						}
					}
				)
			];
		}

		if (element.label === '🔧 工具') {
			return [
				new CalendarItem(
					'填充 Front Matter Date 字段',
					vscode.TreeItemCollapsibleState.None,
					'action',
					() => vscode.commands.executeCommand('memento.fillFrontMatterDate')
				)
			];
		}

		return [];
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

	const switchToCalendarViewDisposable = vscode.commands.registerCommand('memento.switchToCalendarView', () => {
		console.log('Switch to calendar view command triggered');
		mainProvider.switchToCalendarView();
	});

	const switchToSettingsViewDisposable = vscode.commands.registerCommand('memento.switchToSettingsView', () => {
		console.log('Switch to settings view command triggered');
		mainProvider.switchToSettingsView();
	});

	const refreshDisposable = vscode.commands.registerCommand('memento.refreshMdFiles', () => {
		console.log('Refresh command triggered');
		mainProvider.refresh();
	});

	const executeCalendarActionDisposable = vscode.commands.registerCommand('memento.executeCalendarAction', (item: CalendarItem) => {
		console.log('Execute calendar action command triggered');
		if (item.action) {
			item.action();
		}
	});

	const executeSettingActionDisposable = vscode.commands.registerCommand('memento.executeSettingAction', (item: CalendarItem) => {
		console.log('Execute setting action command triggered');
		if (item.action) {
			item.action();
		}
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

	const openDailyNoteDisposable = vscode.commands.registerCommand('memento.openDailyNote', async () => {
		console.log('Open daily note command triggered');
		await openPeriodicNote('daily');
	});

	const openWeeklyNoteDisposable = vscode.commands.registerCommand('memento.openWeeklyNote', async () => {
		console.log('Open weekly note command triggered');
		await openPeriodicNote('weekly');
	});

	context.subscriptions.push(switchToFileViewDisposable);
	context.subscriptions.push(switchToTagViewDisposable);
	context.subscriptions.push(switchToCalendarViewDisposable);
	context.subscriptions.push(switchToSettingsViewDisposable);
	context.subscriptions.push(refreshDisposable);
	context.subscriptions.push(executeCalendarActionDisposable);
	context.subscriptions.push(executeSettingActionDisposable);
	context.subscriptions.push(revealInExplorerDisposable);
	context.subscriptions.push(fillFrontMatterDateDisposable);
	context.subscriptions.push(openDailyNoteDisposable);
	context.subscriptions.push(openWeeklyNoteDisposable);
}

function shouldExcludeFolder(folderName: string, excludeFolders: string[]): boolean {
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
	const config = await loadMementoConfig(dir);

	async function scanDirectory(currentDir: string, rootDir: string) {
		const items = await fs.promises.readdir(currentDir);

		for (const item of items) {
			const itemPath = path.join(currentDir, item);
			const stats = await fs.promises.stat(itemPath);

			if (stats.isDirectory()) {
				// Skip excluded directories
				if (!shouldExcludeFolder(item, config.excludeFolders)) {
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
	const config = await loadMementoConfig(dir);

	async function scanDirectory(currentDir: string, rootDir: string) {
		const items = await fs.promises.readdir(currentDir);

		for (const item of items) {
			const itemPath = path.join(currentDir, item);
			const stats = await fs.promises.stat(itemPath);

			if (stats.isDirectory()) {
				// Skip excluded directories
				if (!shouldExcludeFolder(item, config.excludeFolders)) {
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
	const config = await loadMementoConfig(dir);

	async function scanDirectory(currentDir: string) {
		const items = await fs.promises.readdir(currentDir);

		for (const item of items) {
			const itemPath = path.join(currentDir, item);
			const stats = await fs.promises.stat(itemPath);

			if (stats.isDirectory()) {
				if (!shouldExcludeFolder(item, config.excludeFolders)) {
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

async function openPeriodicNote(type: 'daily' | 'weekly'): Promise<void> {
	const notesPath = await getNotesRootPath();
	if (!notesPath) {
		vscode.window.showErrorMessage('未找到笔记目录');
		return;
	}

	const config = await loadMementoConfig(notesPath);
	const now = new Date();

	let noteDir: string;
	let fileName: string;
	let title: string;
	let template: string;
	let dateStr: string;

	if (type === 'daily') {
		noteDir = path.isAbsolute(config.dailyNotesPath)
			? config.dailyNotesPath
			: path.join(notesPath, config.dailyNotesPath);

		const year = now.getFullYear();
		const month = String(now.getMonth() + 1).padStart(2, '0');
		const day = String(now.getDate()).padStart(2, '0');
		const week = getWeekNumber(now);
		const weekPadded = String(week).padStart(2, '0');

		// Get file name format
		fileName = config.dailyNoteFileNameFormat
			.replace(/\{\{year\}\}/g, String(year))
			.replace(/\{\{month\}\}/g, month)
			.replace(/\{\{day\}\}/g, day)
			.replace(/\{\{week\}\}/g, weekPadded);

		dateStr = `${year}-${month}-${day}`;
		title = `${year}年${month}月${day}日`;

		// Load template from file or use default
		const resolvedTemplatePath = await resolveTemplatePath(config.dailyNoteTemplatePath, notesPath);

		if (resolvedTemplatePath) {
			try {
				template = await fs.promises.readFile(resolvedTemplatePath, 'utf-8');
			} catch (error) {
				vscode.window.showErrorMessage(`无法读取模板文件: ${resolvedTemplatePath}`);
				template = getDefaultDailyTemplate();
			}
		} else {
			template = getDefaultDailyTemplate();
		}

		template = template
			.replace(/\{\{date\}\}/g, dateStr)
			.replace(/\{\{title\}\}/g, title)
			.replace(/\{\{year\}\}/g, String(year))
			.replace(/\{\{month\}\}/g, month)
			.replace(/\{\{day\}\}/g, day)
			.replace(/\{\{week\}\}/g, weekPadded);
	} else {
		noteDir = path.isAbsolute(config.weeklyNotesPath)
			? config.weeklyNotesPath
			: path.join(notesPath, config.weeklyNotesPath);

		const year = now.getFullYear();
		const month = String(now.getMonth() + 1).padStart(2, '0');
		const day = String(now.getDate()).padStart(2, '0');
		const week = getWeekNumber(now);
		const weekPadded = String(week).padStart(2, '0');

		// Get file name format
		fileName = config.weeklyNoteFileNameFormat
			.replace(/\{\{year\}\}/g, String(year))
			.replace(/\{\{month\}\}/g, month)
			.replace(/\{\{day\}\}/g, day)
			.replace(/\{\{week\}\}/g, weekPadded);

		dateStr = `${year}-W${weekPadded}`;
		title = `${year}年第${week}周`;

		// Load template from file or use default
		const resolvedTemplatePath = await resolveTemplatePath(config.weeklyNoteTemplatePath, notesPath);

		if (resolvedTemplatePath) {
			try {
				template = await fs.promises.readFile(resolvedTemplatePath, 'utf-8');
			} catch (error) {
				vscode.window.showErrorMessage(`无法读取模板文件: ${resolvedTemplatePath}`);
				template = getDefaultWeeklyTemplate();
			}
		} else {
			template = getDefaultWeeklyTemplate();
		}

		template = template
			.replace(/\{\{date\}\}/g, dateStr)
			.replace(/\{\{title\}\}/g, title)
			.replace(/\{\{year\}\}/g, String(year))
			.replace(/\{\{month\}\}/g, month)
			.replace(/\{\{day\}\}/g, day)
			.replace(/\{\{week\}\}/g, weekPadded);
	}

	// Ensure directory exists
	try {
		await fs.promises.mkdir(noteDir, { recursive: true });
	} catch (error) {
		vscode.window.showErrorMessage(`无法创建目录: ${noteDir}`);
		return;
	}

	const filePath = path.join(noteDir, fileName);

	// Create file if it doesn't exist
	try {
		await fs.promises.access(filePath);
	} catch {
		// File doesn't exist, create it with template
		await fs.promises.writeFile(filePath, template, 'utf-8');
	}

	// Open the file
	const document = await vscode.workspace.openTextDocument(filePath);
	await vscode.window.showTextDocument(document);
}

async function loadMementoConfig(notesPath: string): Promise<MementoConfig> {
	const configPath = path.join(notesPath, '.memento', 'config.json');

	try {
		await fs.promises.access(configPath);
		const configContent = await fs.promises.readFile(configPath, 'utf-8');
		const userConfig = JSON.parse(configContent);
		return { ...DEFAULT_CONFIG, ...userConfig };
	} catch (error) {
		// Config file doesn't exist, return default config
		return { ...DEFAULT_CONFIG };
	}
}

async function saveMementoConfig(notesPath: string, config: MementoConfig): Promise<void> {
	const configDir = path.join(notesPath, '.memento');
	const configPath = path.join(configDir, 'config.json');

	try {
		// Ensure .memento directory exists
		await fs.promises.mkdir(configDir, { recursive: true });

		// Save config
		await fs.promises.writeFile(configPath, JSON.stringify(config, null, 2), 'utf-8');
	} catch (error) {
		console.error('Error saving config:', error);
		throw error;
	}
}

async function resolveTemplatePath(templatePath: string, notesPath: string): Promise<string> {
	// If empty, return empty to use default template
	if (!templatePath) {
		return '';
	}

	// Check if it's an absolute path
	if (path.isAbsolute(templatePath)) {
		return templatePath;
	}

	// It's a relative path, resolve it relative to notes root path
	return path.join(notesPath, templatePath);
}

function getDefaultDailyTemplate(): string {
	return `---
date: {{date}}
title: {{title}}
tags: [daily]
---

# {{title}}

`;
}

function getDefaultWeeklyTemplate(): string {
	return `---
date: {{date}}
title: {{title}}
tags: [weekly]
---

# {{title}}

## 本周总结

## 下周计划

`;
}

function getWeekNumber(date: Date): number {
	const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
	const dayNum = d.getUTCDay() || 7;
	d.setUTCDate(d.getUTCDate() + 4 - dayNum);
	const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
	return Math.ceil((((d.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
}

// This method is called when your extension is deactivated
export function deactivate() {}
