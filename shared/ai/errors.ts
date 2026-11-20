import { ValidationError } from '../hum/validation';

/** Thrown for malformed assistant requests; the message is safe to show. */
export class AssistantValidationError extends ValidationError {}
