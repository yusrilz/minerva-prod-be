import mongoose from 'mongoose'

export class AppError extends Error {
  constructor(
    public readonly status: number,
    public readonly errorCode: string,
    message: string,
    public readonly details?: unknown,
  ) {
    super(message)
    this.name = 'AppError'
  }
}

export function asAppError(error: unknown) {
  if (error instanceof AppError) return error

  if (error instanceof mongoose.Error.ValidationError) {
    return new AppError(
      422,
      'VALIDATION_ERROR',
      'One or more values are invalid',
      Object.fromEntries(Object.entries(error.errors).map(([field, value]) => [field, value.message])),
    )
  }

  if (error instanceof mongoose.Error.CastError) {
    return new AppError(400, 'INVALID_ID', 'The supplied identifier is invalid')
  }

  if (typeof error === 'object' && error !== null && 'code' in error && error.code === 11000) {
    return new AppError(409, 'CONFLICT', 'A record with those values already exists')
  }

  return new AppError(500, 'INTERNAL_ERROR', 'An unexpected server error occurred')
}

export function assertFound<T>(value: T | null | undefined, message = 'Resource not found'): asserts value is T {
  if (value === null || value === undefined) throw new AppError(404, 'NOT_FOUND', message)
}
