export type MessageServerFnResult =
	| { success: true; message: string }
	| { success: false; error: string };
