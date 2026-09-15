export enum LogLevel {
  DEBUG = 'DEBUG',
  INFO = 'INFO',
  WARN = 'WARN',
  ERROR = 'ERROR',
}

export interface LogEntry {
  timestamp: string;
  level: LogLevel;
  component: string;
  event: string;
  message?: string;
  [key: string]: any;
}

class Logger {
  private log(level: LogLevel, component: string, event: string, data: Record<string, any> = {}) {
    const entry: LogEntry = {
      timestamp: new Date().toISOString(),
      level,
      component,
      event,
      ...data,
    };
    
    // In a real environment, this might stream to a log aggregator or file.
    // For now, structured JSON to stdout.
    const logStr = JSON.stringify(entry);
    
    if (level === LogLevel.ERROR) {
      console.error(logStr);
    } else if (level === LogLevel.WARN) {
      console.warn(logStr);
    } else {
      console.error(logStr);
    }
  }

  debug(component: string, event: string, data?: Record<string, any>) {
    this.log(LogLevel.DEBUG, component, event, data);
  }

  info(component: string, event: string, data?: Record<string, any>) {
    this.log(LogLevel.INFO, component, event, data);
  }

  warn(component: string, event: string, data?: Record<string, any>) {
    this.log(LogLevel.WARN, component, event, data);
  }

  error(component: string, event: string, error?: Error | unknown, data?: Record<string, any>) {
    this.log(LogLevel.ERROR, component, event, {
      ...data,
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
    });
  }
}

export const logger = new Logger();
