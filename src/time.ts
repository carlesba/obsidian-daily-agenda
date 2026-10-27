export type MomentUnit = "day" | "week" | "isoWeek" | "month" | "quarter" | "year";

export interface MomentDate {
	clone(): MomentDate;
	add(amount: number, unit: MomentUnit): MomentDate;
	startOf(unit: MomentUnit): MomentDate;
	format(format?: string): string;
	isValid(): boolean;
	valueOf(): number;
}

export type MomentFactory = (input?: number | string, format?: string, strict?: boolean) => MomentDate;
