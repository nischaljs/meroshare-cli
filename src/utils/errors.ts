export class AppError extends Error {
  constructor(
    message: string,
    public code: string = 'APP_ERROR',
  ) {
    super(message);
    this.name = 'AppError';
  }
}

export class AuthError extends AppError {
  constructor(message: string) {
    super(message, 'AUTH_ERROR');
    this.name = 'AuthError';
  }
}

export class ConfigError extends AppError {
  constructor(message: string) {
    super(message, 'CONFIG_ERROR');
    this.name = 'ConfigError';
  }
}

export class APIError extends AppError {
  constructor(
    message: string,
    public statusCode?: number,
  ) {
    super(message, 'API_ERROR');
    this.name = 'APIError';
  }
}
