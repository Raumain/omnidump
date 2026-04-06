export type Success<T extends object = object> = { success: true } & T;

export type Failure<E = string> = {
	success: false;
	error: E;
};

export type Result<T extends object = object, E = string> =
	| Success<T>
	| Failure<E>;
