export class LookupNotFoundError extends Error {
  readonly statusCode = 404;

  constructor(username: string) {
    super(`No PSN account could be found for username "${username}".`);
    this.name = "LookupNotFoundError";
  }
}

