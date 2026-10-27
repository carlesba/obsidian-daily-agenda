import { accountName } from "./calendar/accounts";
import type { AccountFailure } from "./calendar/accounts";
import { CalendarError } from "./calendar/http";
import { t } from "./i18n";

export function failureMessage({ account, error }: AccountFailure): string {
	return t("accountFailed", { account: accountName(account), reason: failureReason(error) });
}

export function failureReason(error: unknown): string {
	if (error instanceof CalendarError) {
		switch (error.reason) {
			case "missingCredentials":
				return t("reasonMissingCredentials");
			case "authenticationFailed":
				return t("reasonAuthenticationFailed", { status: error.status ?? "", host: hostOf(error.url) });
			case "requestFailed":
				return t("reasonRequestFailed", { status: error.status ?? "", host: hostOf(error.url) });
			case "noPrincipal":
				return t("reasonNoPrincipal");
			case "noCalendarHome":
				return t("reasonNoCalendarHome");
			case "signedOut":
				return t("reasonSignedOut");
		}
	}
	return t("reasonUnknown", { message: error instanceof Error ? error.message : String(error) });
}

function hostOf(url: string | undefined): string {
	if (url === undefined) return "";
	try {
		return new URL(url).host;
	} catch {
		return url;
	}
}
