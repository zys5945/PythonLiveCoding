export interface Terminal{
	sendText(text: string): void;
	show(flag: boolean): void;
	dispose(): void;
}