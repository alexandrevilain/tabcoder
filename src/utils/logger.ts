/**
 * Simple logging utility for TabCoder extension
 */
export interface LogOutput {
	log(message?: any, ...optionalParams: any[]): void;
	warn(message?: any, ...optionalParams: any[]): void;
	error(message?: any, ...optionalParams: any[]): void;
	debug(message?: any, ...optionalParams: any[]): void;
}

export class Logger {
	private readonly PREFIX = '[TabCoder]';
	private readonly logOutput: LogOutput;

	public constructor(logOutput: LogOutput = console) {
		this.logOutput = logOutput;
	}

	/**
	 * Log an informational message
	 */
	public info(message: string, ...args: any[]): void {
		this.logOutput.log(`${this.PREFIX} ${message}`, ...args);
	}

	/**
	 * Log a warning message
	 */
	public warn(message: string, ...args: any[]): void {
		this.logOutput.warn(`${this.PREFIX} ${message}`, ...args);
	}

	/**
	 * Log an error message
	 */
	public error(message: string, ...args: any[]): void {
		this.logOutput.error(`${this.PREFIX} ${message}`, ...args);
	}

	/**
	 * Log a debug message (only in development)
	 */
	public debug(message: string, ...args: any[]): void {
		if (process.env.NODE_ENV === 'development') {
			this.logOutput.debug(`${this.PREFIX} [DEBUG] ${message}`, ...args);
		}
	}
}

export const logger = new Logger();